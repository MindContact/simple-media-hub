#!/usr/bin/env bash
# Converts videos Chrome cannot play natively (avi, mkv, mpeg, ac3/dts audio, ...)
# to browser-friendly mp4 (H.264 + AAC, faststart), so Jellyfin can direct-play
# them instead of transcoding them on a slow server.
#
# Default is a dry run that only prints the plan. With --run it converts:
#   1. writes "<name>.mp4.part" next to the source,
#   2. checks the result (video stream present, same duration as the source),
#   3. moves the original into the backup folder (same relative path), never deletes it,
#   4. renames the .part to "<name>.mp4".
# Sidecar files (.nfo, .srt, -poster.jpg) keep working because the base name does not change.
#
# Usage:
#   tools/convert-to-mp4.sh [--run] [--root DIR] [--backup DIR] [--crf N] [--preset P] [DIR...]
#
# DIRs are relative to --root (or absolute); without DIRs it scans the whole root.
# --root defaults to $MEDIA_ROOT. Requires ffmpeg, ffprobe and jq. A network share must be
# mounted first.
set -euo pipefail

ROOT=${MEDIA_ROOT:-}
BACKUP=
RUN=0
CRF=20
PRESET=medium
DIRS=()
VIDEO_EXT='avi|mkv|mp4|m4v|mov|mpg|mpeg|wmv|flv|ts|m2ts|vob|webm|divx|3gp'

usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d; s/^# \{0,1\}//'; exit "${1:-0}"; }

while (($#)); do
  case $1 in
    --run) RUN=1 ;;
    --root) ROOT=${2:?}; shift ;;
    --backup) BACKUP=${2:?}; shift ;;
    --crf) CRF=${2:?}; shift ;;
    --preset) PRESET=${2:?}; shift ;;
    -h|--help) usage ;;
    -*) echo "Unknown option: $1" >&2; usage 1 ;;
    *) DIRS+=("$1") ;;
  esac
  shift
done

ROOT=${ROOT%/}
[[ -n $ROOT ]] || { echo "Set --root DIR or MEDIA_ROOT" >&2; usage 1; }
BACKUP=${BACKUP:-$ROOT/_originals}
((${#DIRS[@]})) || DIRS=("$ROOT")

for tool in ffmpeg ffprobe jq; do
  command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }
done
if [[ ! -d $ROOT ]] || [[ -z $(ls -A "$ROOT") ]]; then
  echo "$ROOT is missing or empty: is the share mounted?" >&2
  exit 1
fi

LOG=${LOG:-$PWD/convert-to-mp4-$(date +%Y%m%d-%H%M%S).log}
log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$LOG"; }

CURRENT_PART=
trap '[[ -n $CURRENT_PART ]] && rm -f -- "$CURRENT_PART"; echo; log "Interrupted"; exit 130' INT TERM

# Prints "<action> <reason>" where action is skip, remux, audio, video or check.
plan() {
  local info=$1 ext=$2
  local vcodec pix vcount
  vcount=$(jq '[.streams[] | select(.codec_type == "video" and (.disposition.attached_pic // 0) == 0)] | length' <<<"$info")
  if ((vcount == 0)); then echo "check no-video-stream"; return; fi
  vcodec=$(jq -r '[.streams[] | select(.codec_type == "video" and (.disposition.attached_pic // 0) == 0)][0].codec_name' <<<"$info")
  pix=$(jq -r '[.streams[] | select(.codec_type == "video" and (.disposition.attached_pic // 0) == 0)][0].pix_fmt' <<<"$info")
  local bad_audio
  bad_audio=$(jq -r '[.streams[] | select(.codec_type == "audio" and (.codec_name | IN("aac", "mp3") | not)) | .codec_name] | unique | join(",")' <<<"$info")

  if [[ $vcodec != h264 || $pix != yuv420p ]]; then echo "video $ext/$vcodec/$pix"; return; fi
  if [[ -n $bad_audio ]]; then echo "audio $ext/h264/$bad_audio"; return; fi
  if [[ $ext != mp4 && $ext != m4v ]]; then echo "remux $ext/h264"; return; fi
  echo "skip ok"
}

convert() {
  local src=$1 action=$2 info=$3 out=$4
  local vindex
  vindex=$(jq '[.streams[] | select(.codec_type == "video" and (.disposition.attached_pic // 0) == 0)][0].index' <<<"$info")
  local args=(-hide_banner -nostdin -loglevel error -stats -y -i "$src" -map "0:$vindex" -map '0:a?' -map_metadata 0 -map_chapters 0)

  if [[ $action == video ]]; then
    local field
    field=$(jq -r '[.streams[] | select(.codec_type == "video")][0].field_order // "progressive"' <<<"$info")
    local vf=()
    [[ $field =~ ^(tt|bb|tb|bt)$ ]] && vf=(-vf yadif)
    args+=(-c:v libx264 -preset "$PRESET" -crf "$CRF" -pix_fmt yuv420p -profile:v high "${vf[@]}")
  else
    args+=(-c:v copy)
  fi

  # Each audio track: keep aac/mp3, convert anything else to stereo AAC.
  local i=0 codec
  while read -r codec; do
    if [[ $codec == aac || $codec == mp3 ]]; then
      args+=("-c:a:$i" copy)
    else
      args+=("-c:a:$i" aac "-b:a:$i" 192k "-ac:a:$i" 2)
    fi
    i=$((i + 1))
  done < <(jq -r '.streams[] | select(.codec_type == "audio") | .codec_name' <<<"$info")

  # Text subtitles become mov_text; image subtitles (PGS, DVD) cannot go into mp4 and are dropped.
  local text_subs
  text_subs=$(jq '[.streams[] | select(.codec_type == "subtitle" and (.codec_name | IN("subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text")))] | length' <<<"$info")
  if ((text_subs)); then
    local idx
    while read -r idx; do args+=(-map "0:$idx"); done < <(jq -r '.streams[] | select(.codec_type == "subtitle" and (.codec_name | IN("subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text"))) | .index' <<<"$info")
    args+=(-c:s mov_text)
  fi

  args+=(-movflags +faststart -f mp4 "$out")
  ffmpeg "${args[@]}"
}

duration() { ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1" | cut -d. -f1; }

verify() {
  local src=$1 out=$2
  local d_src d_out
  d_src=$(duration "$src" || echo 0)
  d_out=$(duration "$out" || echo 0)
  ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$out" | grep -q h264 || return 1
  # Some old avi files report no duration; then only the video stream check applies.
  [[ -z $d_src || $d_src == 0 || $d_src == N/A ]] && return 0
  local diff=$((d_src > d_out ? d_src - d_out : d_out - d_src))
  ((diff <= 2 + d_src / 100))
}

declare -A COUNT=()
log "Root $ROOT, backup $BACKUP, mode $([[ $RUN == 1 ]] && echo RUN || echo DRY-RUN), log $LOG"

for dir in "${DIRS[@]}"; do
  [[ $dir = /* ]] || dir=$ROOT/$dir
  [[ -d $dir ]] || { log "MISSING DIR $dir"; continue; }
  while IFS= read -r -d '' src; do
    ext=${src##*.}
    ext=${ext,,}
    if ! info=$(ffprobe -v error -show_streams -show_format -of json "$src" 2>/dev/null); then
      log "CHECK  unreadable  ${src#"$ROOT"/}"
      COUNT[check]=$((${COUNT[check]:-0} + 1))
      continue
    fi
    read -r action reason <<<"$(plan "$info" "$ext")"
    COUNT[$action]=$((${COUNT[$action]:-0} + 1))
    [[ $action == skip ]] && continue

    rel=${src#"$ROOT"/}
    final=${src%.*}.mp4
    printf -v tag '%-6s' "${action^^}"
    log "$tag $reason  $rel"
    [[ $RUN == 1 && $action != check ]] || continue

    if [[ $final != "$src" && -e $final ]]; then
      log "  SKIP target exists: ${final#"$ROOT"/}"
      continue
    fi
    CURRENT_PART=$final.part
    start=$SECONDS
    if ! convert "$src" "$action" "$info" "$CURRENT_PART"; then
      log "  FAILED ffmpeg, original untouched"
      rm -f -- "$CURRENT_PART"; CURRENT_PART=
      COUNT[failed]=$((${COUNT[failed]:-0} + 1))
      continue
    fi
    if ! verify "$src" "$CURRENT_PART"; then
      log "  FAILED check (duration/video), original untouched, kept $(basename "$CURRENT_PART") for inspection"
      CURRENT_PART=
      COUNT[failed]=$((${COUNT[failed]:-0} + 1))
      continue
    fi
    mkdir -p -- "$BACKUP/$(dirname "$rel")"
    mv -n -- "$src" "$BACKUP/$rel"
    mv -n -- "$CURRENT_PART" "$final"
    CURRENT_PART=
    log "  OK in $((SECONDS - start))s ($(du -h "$BACKUP/$rel" | cut -f1) -> $(du -h "$final" | cut -f1))"
    COUNT[done]=$((${COUNT[done]:-0} + 1))
  done < <(find "$dir" -path "$BACKUP" -prune -o -type f -regextype posix-extended -iregex ".*\.($VIDEO_EXT)$" ! -name '*.part' -print0 | sort -z)
done

summary=""
for k in skip remux audio video check done failed; do
  [[ -n ${COUNT[$k]:-} ]] && summary+="$k=${COUNT[$k]} "
done
log "Summary: ${summary:-nothing found}"
[[ $RUN == 1 ]] || log "Dry run only. Re-run with --run to convert."
