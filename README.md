# Cookies and Crumbs

A mobile-first Bejeweled-style match-3 browser game. Pieces are cookies. Built for Besky.

Portrait phone first, also works on desktop. The home screen offers two modes. Swap adjacent cookies by drag or tap-tap, match 3+ in a row or column, watch them pop into crumbs, and chase cascades for score.

**Challenge Mode** opens the level map: a vertical path you climb from level 1 at the bottom, 45 levels in three chapters of 15 (Opening Shift 1–15 specials, Jar Jam 16–30 jars, Showstopper 31–45 prize cookies). Each chapter runs Teach (1–3), Practice (4–7), Twist (8–10), Mix (11–14), then a Boss (The Morning Rush, Lid Lock, Behind the Glass). Tap any unlocked cookie node to play it. A valid swap costs one move. Cascades are free. Reach the score goal to clear the level; after that the level keeps going until moves run out (or you lock in 3 stars) so you can chase more stars. Going home does not clear the unlocked level. After a clear, **Continue** returns to the map, which glides to the next level, plays the unlock, and marks it with a **Next!** highlight (**Replay** retries the level).

Goals were set with a headless balance sim (greedy bot on the real game code, hundreds of seeds per level) so the win rate falls through each chapter and eases after every boss.

**Stars** (best per level is kept):

- ★ reach the score goal
- ★★ goal + every quest for that level
- ★★★ goal + every quest + at least 1.5× the goal

**Bake-athon!** has no move limit. The score just keeps climbing.

The highest unlocked level is stored in localStorage (`cookies-and-crumbs-unlocked`), and best stars per level in `cookies-and-crumbs-stars` (JSON array). `cookies-and-crumbs-save-version` = 2 marks saves upgraded from the old 12-level set (old 1–4 → 1–4, 5–8 → 16–19, 9–12 → 31–34). The gear on the home screen opens Settings, where **Reset progress** (after a confirm) clears the unlock and stars keys and keeps the save marked v2, so the migration never re-runs on a fresh start.

In `npm run dev` only, `cnc.finish(score, allQuests)` in the console ends the current level for testing.

## Sound

Sound effects (set B, synthesized for this game) live in `public/sfx/` as `.ogg` and `.mp3`. Ogg is used where the browser supports it; Safari and iOS get mp3. `src/audio.ts` fetches them at startup, then creates and unlocks one Web Audio context on the first tap or key press and decodes each file once. Repeats of the same sound within 40 ms are dropped and at most 8 voices play at once. The leading silence in each file is skipped. Per-sound volumes are in `VOLUME`.

Settings (gear on the home screen) has a **Music** row and a **Sound effects** row, each with an on/off switch and a 0–100% volume slider (defaults 70% and 80%). The sliders use a squared curve, `gain = top × (v/100)²`, with `top` set so the defaults match the original mix: music 0.45 at 70% (0.918 at 100%), SFX bus 0.9 at 80% (1.406 at 100%). A soft limiter on the shared output catches peaks. Volume changes ramp smoothly (30 ms time constant), and releasing the SFX slider plays a short preview. Saved in `cookies-and-crumbs-music`, `cookies-and-crumbs-sound`, `cookies-and-crumbs-music-volume` and `cookies-and-crumbs-sfx-volume`; Reset progress leaves them alone.

**Music** (Besky's Suno loops, in `public/music/` as `.ogg` and `.m4a`; AAC on Safari/iOS): *Café Jazz Loop* on the home menu and map, *Bakery Groove* in levels and Bake-athon, *Dough and Synth* on boss levels 15, 30 and 45. Each loop was cut on bar boundaries from the body of the track (intro and fade dropped) using beat tracking and a spectral match of the audio around both ends, with an 80 ms equal-power crossfade at the seam. `src/music.ts` loops them sample-accurately with Web Audio (`loopStart`/`loopEnd`), crossfades scenes over 0.8 s at volume 0.45, starts on the first tap, pauses while the tab is hidden, and loads lazily (menu after the art, the others in the background, at most two decoded at once). Settings has a separate **Music** switch (`cookies-and-crumbs-music`), also kept by Reset progress.

| track | loop | source region | bars |
|---|---|---|---|
| menu (Café Jazz Loop) | 80.84 s | 7.024–87.863 s | 32 |
| gameplay (Bakery Groove) | 70.46 s | 56.053–126.513 s | 32 |
| boss (Dough and Synth) | 116.70 s | 34.853–151.555 s | 64 |

Each file has 1 s of the loop's tail before `loopStart` (1.0 s) and 1 s of its head after `loopEnd`, so the seam stays clean even if a decoder shifts the audio a little.

## Run

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview
```

## Notes

- Art lives in `public/cookies/` (whole cookies are playable; smashed PNGs are included for a later pop effect).
- No sound yet. First version pops with scale/fade plus crumb particles.
- No special pieces (striped, bombs, etc.) yet.
