# Changelog

All notable changes to L’Isola dei Bimbi (simple-media-hub) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Entries before 2026-11-12 were reconstructed from the git history.

## [Unreleased]

### Added

- Admin page: an eye button shows what is typed in the admin password and
  Jellyfin API key fields.

## [1.0.0] - 2026-10-27

### Added

- **Home screen:** a kid-friendly page for a browser on a TV or monitor, in
  Italian, driven with arrow keys, Enter and Esc (keyboard, remote or air
  mouse), with no ads and no tracking.
- **Guarda (watch):** big tiles with the ❤ favorites of one Jellyfin user
  first, then every library that user can see; info page with plot, runtime,
  rating, ❤ toggle and episodes; ▶ on a tile (or Space) plays at once;
  full-screen playback inside the page; series resume where they were left;
  typing anywhere starts a search.
- **Gioca (play):** 19 offline games — Tetris, Arkanoid, Pac-Man, Space
  Invaders, Sokoban (21 levels), pinball, 2048, Dino, Pong, a platformer,
  Memory, tic-tac-toe, Minesweeper (Campo fiorito), puzzle, coloring (Colora),
  letters and numbers, and checkers, nine men's morris and chess against the
  computer — in a sandboxed iframe that cannot reach the network.
- **Admin page:** behind the password from `.env`: app name, theme generated
  from one base color, animated or picture background, Jellyfin address, API
  key and user with a connection test, which games show and in which order,
  time zone and weather place.
- **Header:** date and time in the TV's or the chosen time zone and the
  current weather from Open-Meteo, fetched by the server every 15 minutes.
- **Jellyfin:** the server keeps the API key and serves only what the chosen
  user can see, so library access and parental ratings are set in Jellyfin;
  direct play of H.264/VP9/AV1 streams with HLS transcoding as fallback;
  `tools/convert-to-mp4.sh` converts a library to direct-playable mp4.
- **PWA:** installable full screen; the page and the games still open when
  the server is down (https or localhost).
- **Running it:** Docker Compose, Node 24 without Docker, or `deploy.sh` to
  a remote Docker host; settings in SQLite; free software under the GNU
  AGPL-3.0-or-later.

[Unreleased]: https://github.com/MindContact/simple-media-hub/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/MindContact/simple-media-hub/releases/tag/v1.0.0
