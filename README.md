# Pelican Express

A pelican rides a bicycle down a winding road past road signs for 53 personal AI agents, from
AstrBot (2022-12-08) to rabbit OS3 (2026-09-22). One self-contained Three.js file, nothing pre-made:
the pelican, bike, road, terrain, trees, sky, lettering and sign emblems are all generated in code
(no SVG, no 2D canvas, no external models or textures).

- **`index.html`** - the scene. Open it in a modern browser (needs internet once, for three.js from a CDN).
- **`video/pelican-express.mp4`** - the 90-second ride rendered to video (Chase camera, 1280x720, 30 fps).
- **`data/agents.csv`** - the 53 agents, launch dates, what each date marks, and sign position on the road.
- **`data/sources.md`** - where the dates came from, and the caveats.

## Watching it

Open `index.html`. The ride starts by itself and takes 90 seconds. Keys: `Space` pause/replay, `R` restart,
`1` chase, `2` auto-cut cameras, `3` side, `4` front, `5` free orbit, `←`/`→` skip 5 s. Hover a sign for
its date and what the date marks.

URL options: `?t=60` ride length in seconds, `?from=2026-03-01` start further along the timeline.

## How the signs are spaced

Real launch dates are very uneven (20 launches in one February fortnight, then 447 days of nothing), so
strict proportional spacing would bunch signs up. The gap to the next sign grows with the time gap but
saturates: `gap = 10.5 + 15.5 * (1 - exp(-days / 25))` metres. Order is always exact and bigger date gaps
always mean longer stretches of road. Result: a sign every 1.15 to 2.8 s (average 1.7 s) at cruising speed.
Sign shapes/colours encode the category (see the legend in the scene).

The emblems on the signs are generated stand-ins, one per name. They are not the products' real logos.

## Building

```
./build.sh          # src/* -> index.html (and a syntax check)
```

Tunables: `SPACING` in `src/p1_data.js` (sign spacing), `HEAD` in `src/p3_world.js` (road curviness),
`RIDE_TA` / `RIDE_TD` in `src/p6_main.js` (ease in / out).

| file | contents |
| --- | --- |
| `src/p0_head.html` | page shell, HUD styles, import map |
| `src/p1_data.js` | agent list, spacing law, procedural stroke font |
| `src/p2_signs.js` | sign shapes, generated emblems, lettering |
| `src/p3_world.js` | road centre line, terrain, sky, scenery, sign placement |
| `src/p4_bike.js` | bicycle (frame, wheels, chain, cranks, drop bars) |
| `src/p5_pelican.js` | pelican and its IK legs/wings |
| `src/p6_main.js` | ride timing, cameras, HUD, controls, frame-stepping hooks |

## Re-rendering the video

Frames are rendered one at a time by headless Chromium with software WebGL (no GPU), so any frame can be
reproduced exactly. Expect roughly 1.4 s per frame per worker at 720p.

```
cd tools/video && npm install
node render.mjs 0 1365 30 frames &  node render.mjs 1365 2730 30 frames &  wait   # two workers
./encode.sh 30 20                                                                 # -> ../../video/pelican-express.mp4
```

Each worker pre-runs 4 s of camera smoothing before its first frame, so chunks join seamlessly.
Needs `ffmpeg` on the PATH.
