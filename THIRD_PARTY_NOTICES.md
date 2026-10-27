# Third-party notices

The hub's own code is under the GNU AGPL-3.0-or-later (see `LICENSE`). It ships the following third-party
software and assets, each under its own license. The same list is shown in the app's ℹ️ dialog
(`public/credits.js`).

| Component | Used for | License | Copyright | Source | License file |
|---|---|---|---|---|---|
| hls.js | HLS video playback (npm dependency) | Apache-2.0 | © 2017 Dailymotion | [video-dev/hls.js](https://github.com/video-dev/hls.js) | `node_modules/hls.js/LICENSE` |
| Javascript Tetris | Tetris | MIT | © 2011–2016 Jake Gordon and contributors | [jakesgordon/javascript-tetris](https://github.com/jakesgordon/javascript-tetris) | `public/games/tetris/LICENSE` |
| Javascript Breakout | Arkanoid | MIT | © 2011–2016 Jake Gordon and contributors | [jakesgordon/javascript-breakout](https://github.com/jakesgordon/javascript-breakout) | `public/games/arkanoid/LICENSE` |
| Javascript Pong | Pong | MIT | © 2011–2016 Jake Gordon and contributors | [jakesgordon/javascript-pong](https://github.com/jakesgordon/javascript-pong) | `public/games/pong/LICENSE` |
| Javascript Tiny Platformer | Platform | MIT | © 2013–2016 Jake Gordon and contributors | [jakesgordon/javascript-tiny-platformer](https://github.com/jakesgordon/javascript-tiny-platformer) | `public/games/platform/LICENSE` |
| SoundManager 2 | Arkanoid sounds | BSD | © 2007 Scott Schiller | [scottschiller/SoundManager2](https://github.com/scottschiller/SoundManager2) | `public/games/arkanoid/sound/license.txt` |
| Pac-Man | Pac-Man | MIT | © 2016 Haole Zheng | [mumuy/pacman](https://github.com/mumuy/pacman) | `public/games/pacman/LICENSE` |
| Press Start 2P | Pac-Man font | OFL-1.1 | © 2012 CodeMan38 | [Google Fonts](https://fonts.google.com/specimen/Press+Start+2P/license) | — |
| Space Invaders | Space Invaders | MIT | © 2019 Dave Kerr | [dwmkerr/spaceinvaders](https://github.com/dwmkerr/spaceinvaders) | `public/games/invaders/LICENSE` |
| 2048 | 2048 | MIT | © 2014 Gabriele Cirulli | [gabrielecirulli/2048](https://github.com/gabrielecirulli/2048) | `public/games/2048/LICENSE.txt` |
| Clear Sans | 2048 font | Apache-2.0 | © 2013 Intel Corporation | [intel/clear-sans](https://github.com/intel/clear-sans) | — |
| t-rex-runner | Dino (Chromium's offline game) | BSD-3-Clause | © 2022 牛さん; © 2014 The Chromium Authors | [wayou/t-rex-runner](https://github.com/wayou/t-rex-runner) | `public/games/dino/LICENSE` |

Weather data, when a place is set in the admin page, comes from the
[Open-Meteo](https://open-meteo.com) API under CC BY 4.0 (© Open-Meteo.com); the server fetches it,
nothing is bundled.

Sokoban, Flipper, Memory, Tris, Campo fiorito, Puzzle, Colora, Lettere e numeri, Dama, Tria and
Scacchi are written for this project and are under its AGPL license.

## Changes to the third-party games

Their pages were rewritten to run offline inside the hub: trackers (Google Analytics), external
fonts, links and FPS counters removed; texts translated to Italian; arrow-key controls added where
missing; asset paths made relative; Pong's English text images replaced by drawn text; the
platformer level turned from JSON into a script (games may not use the network).

## Not included

Some games by the same authors were left out because their media is not covered by the license of
their code: `javascript-snakes` (stock images and music), `javascript-racer` (paid-licensed music,
borrowed sprites) and `javascript-gauntlet` (project-only music and sound effects, ripped sprites).

## Assets to double check before redistributing

The sounds and textures that came with the MIT games carry no separate notice in their repositories,
so they are taken to be covered by the repository license: `tetris/texture.jpg`,
`arkanoid/images/`, `arkanoid/sound/breakout/*.mp3`, `invaders/sounds/*.wav`, `pong/sounds/*.wav`,
`platform/tiles.png`.
