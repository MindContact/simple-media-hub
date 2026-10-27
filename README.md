# L’Isola dei Bimbi — simple-media-hub

*[Leggi in italiano](README.it.md)*

A kid-friendly home screen for a browser on a TV or monitor: big tiles with the cartoons and films
of one [Jellyfin](https://jellyfin.org) user, played full screen inside the page, plus a set of
offline games. Built to be driven with arrow keys, Enter and Esc (a cheap keyboard, a remote
or an air mouse), with no ads, no tracking and no outside network access for the games.

The interface is in Italian.

## Features

- **Guarda** (watch): the user's ❤ favorites first, then every library the Jellyfin user can see.
  Info page with plot, runtime, rating, ❤ toggle and episodes; ▶ on a tile (or Space) plays
  straight away; series resume where they were left; typing anywhere starts a search.
- **Gioca** (play): 19 games, from Tetris, Pac-Man and Space Invaders to Memory, Sokoban
  (21 levels), chess, checkers and nine men's morris against the computer. They run in a sandboxed
  iframe that cannot reach the network.
- **Admin page** (⚙️, password from `.env`): app name, theme generated from one base color,
  animated or picture background, Jellyfin address / API key / user with a connection test,
  which games show and in which order, time zone and weather place.
- **Clock and weather** in the header: date and time (the TV's time zone or the one set in the admin
  page) and, once a place is chosen, the current weather from [Open-Meteo](https://open-meteo.com)
  (no API key; the server fetches it every 15 minutes, the TV only talks to the hub).
- **PWA**: installable full screen; the page and the games still open when the server is down
  (browsers allow this on https or localhost only).
- Zero runtime dependencies besides [hls.js](https://github.com/video-dev/hls.js); settings in
  SQLite through Node's built-in `node:sqlite`.

## How it talks to Jellyfin

The server holds the Jellyfin API key; the browser never sees it. Everything is fetched as one
Jellyfin user and the hub serves only what that user can see, so **library access and parental
ratings are set in Jellyfin**: create a user for the kids, enable only their libraries, and point
the hub at it.

Playback asks Jellyfin for streams Chrome can play directly (H.264/VP9/AV1 in mp4/webm) and falls
back to HLS transcoding. `tools/convert-to-mp4.sh` converts a library to direct-playable mp4 when
the server is too slow to transcode.

## Quick start

With Docker:

```sh
cp .env.example .env      # set ADMIN_PASSWORD, chmod 600 .env
docker compose up -d --build
```

Open `http://<host>:8099`, then ⚙️ → Jellyfin: server address, API key (Jellyfin dashboard →
API keys) and user name. **Prova connessione** checks them and lists the users.

Without Docker (Node 24 or later):

```sh
npm ci
cp .env.example .env
ENV_FILE=.env PORT=8099 npm start
```

`deploy.sh` builds and runs the image on a remote Docker host over ssh (`HOST=user@server ./deploy.sh`).

## Configuration

| Variable | Default | |
|---|---|---|
| `ADMIN_PASSWORD` | — | Enables the admin page. Without it the page stays disabled. |
| `JELLYFIN_URL` | `http://localhost:8096` | Jellyfin address, as seen from the hub server. |
| `JELLYFIN_API_KEY` | — | Jellyfin API key. |
| `JELLYFIN_USER` | — | Jellyfin user whose favorites and libraries are shown. |
| `PORT` | `8080` | HTTP port. |
| `DATA_DIR` | `./data` (`/data` in Docker) | Settings database and uploaded background. |
| `ENV_FILE` | `/run/secrets/media-hub.env` | File the variables above are read from (environment wins). |

The admin page stores its settings in `DATA_DIR/hub.db` (file mode 600); they win over the
environment, and an empty Jellyfin field falls back to it. The API key is write-only: the page
never gets it back. The TV picks up changes within five minutes, or on reload.

## Security

The hub is meant for a trusted home network. Watching needs no login, by design: anyone who can
reach the port can browse and play what the configured Jellyfin user can see, and change that
user's favorites and progress. Do not expose it to the internet without an authenticating proxy
in front.

The admin page uses an HttpOnly, SameSite=Strict session cookie and locks out for a minute after
five wrong passwords. Games are served with a CSP that forbids network access and run in an
`allow-scripts`-only sandbox.

## Games

Each game is a folder in `public/games/<id>/` listed in `src/games.js`. A game page loads
`games/shell.js`, which turns Esc / Backspace into "back to the hub" and replays keys that land on
the hub while the game is open. Games written for the hub share `games/kit.js` (sounds, grid
cursor, messages); their rules live in separate modules covered by `npm test` (chess move
generation is checked against the standard perft counts).

Third-party games and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
and in the app's ℹ️ dialog.

## Development

```
src/            Node server: Jellyfin client, access control, admin API, settings (SQLite)
public/         the page (app.js), admin page, theme and background code, service worker
public/games/   the games
test/           node --test
tools/          convert-to-mp4.sh
```

```sh
npm test
```

## License

Copyright © 2026 Roberto Luttino.

Free software under the [GNU Affero General Public License](LICENSE), version 3 or (at your
option) any later version. If you run a modified hub for other people, you must offer them its
source: point `homepage` in `package.json` at your code and the ℹ️ dialog links it.

Bundled third-party games, fonts and libraries keep their own licenses: see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
