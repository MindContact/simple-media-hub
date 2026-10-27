// Minimal Jellyfin client. Every call goes out with the server API key; the
// browser never sees it.

export const DEVICE_ID = 'media-hub';

// What Chrome on desktop plays natively. Anything else is transcoded to HLS.
const DEVICE_PROFILE = {
  MaxStreamingBitrate: 40_000_000,
  DirectPlayProfiles: [
    { Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264,vp9,av1', AudioCodec: 'aac,mp3,opus,flac' },
    { Container: 'webm', Type: 'Video', VideoCodec: 'vp8,vp9,av1', AudioCodec: 'vorbis,opus' },
  ],
  TranscodingProfiles: [
    {
      Container: 'ts', Type: 'Video', Protocol: 'hls', Context: 'Streaming',
      VideoCodec: 'h264', AudioCodec: 'aac', MaxAudioChannels: '2',
      BreakOnNonKeyFrames: true, MinSegments: 1,
    },
  ],
  // The hub never shows subtitles, but without these profiles Jellyfin burns the
  // default subtitle track into the picture and forces a full video transcode.
  SubtitleProfiles: ['srt', 'subrip', 'ass', 'ssa', 'vtt', 'webvtt', 'mov_text', 'pgssub', 'dvdsub', 'dvbsub']
    .map(Format => ({ Format, Method: /^(pgs|dvd|dvb)sub$/.test(Format) ? 'Drop' : 'External' })),
};

export class Jellyfin {
  constructor(baseUrl, apiKey, userName) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.userName = userName;
    this.auth = `MediaBrowser Client="Media Hub", Device="Media Hub", DeviceId="${DEVICE_ID}", Version="1.0.0", Token="${apiKey}"`;
    this.userId = null;
  }

  fetch(path, init = {}) {
    return fetch(this.baseUrl + path, {
      ...init,
      headers: { Authorization: this.auth, 'Content-Type': 'application/json', ...init.headers },
    });
  }

  async json(path, init) {
    const res = await this.fetch(path, init);
    if (!res.ok) throw new Error(`Jellyfin ${res.status} on ${init?.method ?? 'GET'} ${path.split('?')[0]}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // Resolved lazily so the hub starts even while Jellyfin is still booting.
  async user() {
    if (!this.userId) {
      if (!this.userName) throw new Error('Jellyfin user not set (JELLYFIN_USER or the admin page)');
      const users = await this.json('/Users');
      const user = users.find(u => u.Name.toLowerCase() === this.userName.toLowerCase());
      if (!user) throw new Error(`Jellyfin user "${this.userName}" not found`);
      this.userId = user.Id;
    }
    return this.userId;
  }

  async favorites() {
    const userId = await this.user();
    const res = await this.json(`/Items?userId=${userId}&isFavorite=true&recursive=true`
      + '&includeItemTypes=Movie,Series,Episode,MusicVideo,Video&sortBy=SortName&enableUserData=true');
    return res.Items.map(toItem);
  }

  // The user's libraries, video ones only.
  async libraries() {
    const userId = await this.user();
    const res = await this.json(`/UserViews?userId=${userId}`);
    return res.Items
      .filter(v => ['movies', 'tvshows', 'musicvideos', 'homevideos', undefined].includes(v.CollectionType))
      .map(toItem);
  }

  async libraryItems(libraryId) {
    const userId = await this.user();
    const res = await this.json(`/Items?userId=${userId}&parentId=${libraryId}&recursive=true`
      + '&includeItemTypes=Movie,Series,MusicVideo,Video&sortBy=SortName&enableUserData=true&limit=2000');
    return res.Items.map(toItem);
  }

  // Jellyfin applies the user's library access and parental rating to searches.
  async search(term) {
    const userId = await this.user();
    const res = await this.json(`/Items?userId=${userId}&recursive=true&searchTerm=${encodeURIComponent(term)}`
      + '&includeItemTypes=Movie,Series,Episode,MusicVideo,Video&enableUserData=true&limit=60');
    return res.Items.map(toItem);
  }

  async item(id) {
    const userId = await this.user();
    return toItem(await this.json(`/Items/${id}?userId=${userId}`));
  }

  async details(id) {
    const userId = await this.user();
    const i = await this.json(`/Items/${id}?userId=${userId}`);
    return {
      ...toItem(i),
      overview: i.Overview ?? '',
      genres: i.Genres ?? [],
      officialRating: i.OfficialRating ?? null,
      seriesName: i.SeriesName ?? null,
    };
  }

  async setFavorite(id, favorite) {
    const userId = await this.user();
    await this.json(`/UserFavoriteItems/${id}?userId=${userId}`, { method: favorite ? 'POST' : 'DELETE' });
  }

  async episodes(seriesId) {
    const userId = await this.user();
    const res = await this.json(`/Shows/${seriesId}/Episodes?userId=${userId}&enableUserData=true`);
    return res.Items.map(toItem);
  }

  async playbackInfo(id) {
    const userId = await this.user();
    const info = await this.json(`/Items/${id}/PlaybackInfo?userId=${userId}`, {
      method: 'POST',
      body: JSON.stringify({
        UserId: userId,
        DeviceProfile: DEVICE_PROFILE,
        MaxStreamingBitrate: DEVICE_PROFILE.MaxStreamingBitrate,
        SubtitleStreamIndex: -1,
        AutoOpenLiveStream: true,
      }),
    });
    const source = info.MediaSources[0];
    if (source.SupportsDirectPlay) {
      return {
        mode: 'direct',
        url: `/jf/Videos/${id}/stream?static=true&mediaSourceId=${source.Id}&playSessionId=${info.PlaySessionId}`,
        playSessionId: info.PlaySessionId,
        mediaSourceId: source.Id,
      };
    }
    if (!source.TranscodingUrl) throw new Error(`No playable stream for ${id}`);
    return {
      mode: 'hls',
      url: '/jf' + stripApiKey(source.TranscodingUrl),
      playSessionId: info.PlaySessionId,
      mediaSourceId: source.Id,
    };
  }

  // Played is only ever set, never cleared: rewatching a bit of a watched episode keeps its ✓.
  async saveProgress(id, { positionTicks, played }) {
    const userId = await this.user();
    await this.json(`/UserItems/${id}/UserData?userId=${userId}`, {
      method: 'POST',
      body: JSON.stringify({
        PlaybackPositionTicks: positionTicks,
        ...(played && { Played: true }),
        LastPlayedDate: new Date().toISOString(),
      }),
    });
  }

  // Tells Jellyfin the session is over so it kills the ffmpeg transcode.
  async stopped({ id, playSessionId, mediaSourceId, positionTicks }) {
    await this.json('/Sessions/Playing/Stopped', {
      method: 'POST',
      body: JSON.stringify({ ItemId: id, PlaySessionId: playSessionId, MediaSourceId: mediaSourceId, PositionTicks: positionTicks }),
    });
  }
}

export function normalizeId(id) {
  return id.replace(/-/g, '').toLowerCase();
}

export function stripApiKey(url) {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) if (/^api_?key$/i.test(key)) params.delete(key);
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

function toItem(i) {
  return {
    id: i.Id,
    type: i.Type,
    name: i.Name,
    year: i.ProductionYear ?? null,
    seriesId: i.SeriesId ?? null,
    season: i.ParentIndexNumber ?? null,
    seasonName: i.SeasonName ?? null,
    index: i.IndexNumber ?? null,
    hasImage: Boolean(i.ImageTags?.Primary),
    runTicks: i.RunTimeTicks ?? 0,
    resumeTicks: i.UserData?.PlaybackPositionTicks ?? 0,
    played: i.UserData?.Played ?? false,
    isFavorite: i.UserData?.IsFavorite ?? false,
    // Episodes have no backdrop of their own: Jellyfin points to the series one.
    backdropId: i.BackdropImageTags?.length ? i.Id : i.ParentBackdropItemId ?? null,
    lastPlayed: i.UserData?.LastPlayedDate ?? null,
  };
}
