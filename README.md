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

While a Cherry Bomb is on the board it plays a looping fuse sizzle (`public/sfx/fuse-sizzle.ogg`, `.m4a` for Safari/iOS, a seamless 1.811 s loop). Each bomb gets its own loop starting at a random offset, with at most 3 at once (the oldest bombs). The loops run through the SFX bus, so they follow the Sound switch and slider, and they don't count toward the 8-voice limit. A loop fades out over about 40 ms as `bomb-boom` plays. Loops also stop when the level ends, when you leave for the map or home, on a retry or fresh deal, and when the tab is hidden; they restart when you come back. `Game.syncSizzle()` reconciles them with the board every frame.

Settings (gear on the home screen) has a **Music** row and a **Sound effects** row, each with an on/off switch and a 0–100% volume slider (defaults 70% and 80%). The sliders use a squared curve, `gain = top × (v/100)²`, with `top` set so the defaults match the original mix: music 0.45 at 70% (0.918 at 100%), SFX bus 0.9 at 80% (1.406 at 100%). A soft limiter on the shared output catches peaks. Volume changes ramp smoothly (30 ms time constant), and releasing the SFX slider plays a short preview. Saved in `cookies-and-crumbs-music`, `cookies-and-crumbs-sound`, `cookies-and-crumbs-music-volume` and `cookies-and-crumbs-sfx-volume`; Reset progress leaves them alone.

**Music** (Besky's Suno loops, in `public/music/` as `.ogg` and `.m4a`; AAC on Safari/iOS): *Café Jazz Loop* on the home menu and map, *Bakery Groove* in levels and Bake-athon, *Dough and Synth* on boss levels 15, 30 and 45. Each loop was cut on bar boundaries from the body of the track (intro and fade dropped) using beat tracking and a spectral match of the audio around both ends, with an 80 ms equal-power crossfade at the seam. `src/music.ts` loops them sample-accurately with Web Audio (`loopStart`/`loopEnd`), crossfades scenes over 0.8 s at volume 0.45, starts on the first tap, pauses while the tab is hidden, and loads lazily (menu after the art, the others in the background, at most two decoded at once). Settings has a separate **Music** switch (`cookies-and-crumbs-music`), also kept by Reset progress.

| track | loop | source region | bars |
|---|---|---|---|
| menu (Café Jazz Loop) | 80.84 s | 7.024–87.863 s | 32 |
| gameplay (Bakery Groove) | 70.46 s | 56.053–126.513 s | 32 |
| boss (Dough and Synth) | 116.70 s | 34.853–151.555 s | 64 |

Each file has 1 s of the loop's tail before `loopStart` (1.0 s) and 1 s of its head after `loopEnd`, so the seam stays clean even if a decoder shifts the audio a little.

## Boosters

Five player-held helpers sit in a bar under the board (icon, count badge, 44 px+ touch targets). Art is in `public/boosters/` (128 px PNGs); `BOOSTER_ICON_SRC` in `src/boosters.ts` maps each booster to its file, `null` or a failed load falls back to an emoji.

| booster | what it does |
|---|---|
| Rolling Pin | Tap it, then tap a row: the whole row is cleared like a match (jars break and stay, prizes pay out, then it settles and cascades). Cherry Bombs in the row are left alone, like on a four-in-a-row line clear. |
| Spatula Swap | Tap it, then tap any two cookies (adjacent or not, even if nothing matches). They swap and matches resolve normally. Jars can't be picked. |
| Oven Mitt Undo | Takes back your last move: board, moves, score, quest progress and best move. One level only. Stars and unlocks already banked stay banked. |
| Sprinkle Shuffle | Rearranges the loose cookies so there are no matches and at least one move. Jars, prize cookies and Cherry Bombs stay put. |
| Extra Scoop | +5 moves. Levels only: disabled in Bake-athon (no move limit). |

How they behave:

- Targeted boosters (Pin, Spatula) are armed first: the button lights up and a prompt shows. Tap the button again or press Esc to cancel without spending it. While armed, swipes on the board do nothing and taps pick the target. On a mouse, the Pin previews the row under the cursor.
- None of them spend a move, and the count only drops when the booster actually fires.
- Boosters need the board to be settled and a level running. A greyed button explains why when tapped.
- **Stars:** no penalty for using boosters. Points they earn count normally. (Extra Scoop and Undo can of course make 3 stars easier.)
- **Undo** is available only right after a valid move. Any other booster (Pin, Spatula, Shuffle) clears the undo, since undoing past it would lose that booster's effect without a refund. Extra Scoop keeps it and adds its moves to the snapshot too.
- Sounds are existing effects reused as placeholders (`BOOSTERS[...].sfx`): Pin `line-clear`, Spatula `swap`, Undo `unlock`, Shuffle `bomb-plant`, Scoop `quest-done`.
- Counts are saved in `cookies-and-crumbs-boosters` (JSON by booster id). A save without the key (every existing player) starts at `BOOSTER_START_STOCK`; a bad or blocked save does too. Stars and unlocks are never touched. Reset progress leaves boosters alone.

**Test build:** `BOOSTER_START_STOCK` is 3 and Settings (gear on the home screen) has a **Grant test boosters (+5 each)** button, up to 99 each. Before publishing set `BOOSTER_START_STOCK = 0` and `SHOW_TEST_TOOLS = false` in `src/boosters.ts`. In `npm run dev`, `cnc.boosters.grant()` and `cnc.boosters.count(id)` work from the console.

## Reward cookies, coins and the daily reward

Three special pieces that are handed out as rewards and never made by matching. They wait in a saved queue (`cookies-and-crumbs-reward-queue`) and are placed on the board when the player **starts a Challenge level** (not Bake-athon, which leaves the queue alone). A Retry after a failed level deals the same pieces again; going Home mid-level or a fresh start from the map does not. Art is in `public/rewards/` (128 px); a missing file falls back to a vector or emoji placeholder.

| piece | how it works |
|---|---|
| Golden Cookie | A normal cookie of a random flavor with a golden glow. **It matches as its flavor** (simplest and robust: no wild-card matching rules). Cleared by anything (match, line, blast, Rolling Pin, Cookie Crush) it pays **+500** with a gold sparkle burst. It never becomes a Cherry Bomb, like prize cookies. |
| Rainbow Dough | Its own piece that never matches (like a Cherry Bomb). **Swap it with an adjacent plain cookie** (a normal move that costs a move) and every cookie of that flavor, jars included, plus the dough, is cleared as a Cookie Crush (+200 bonus), then it cascades. Dough swapped with a jar, a Cherry Bomb or another dough just bounces. Line clears, Cherry Bomb blasts and Cookie Crush leave it alone, but a blast next to it does clear it. Rolling Pin and Sprinkle Shuffle skip it. It counts as a legal move, so it never causes "No moves left". |
| Lucky Fortune | A normal cookie of a random flavor with a fortune-cookie badge. When cleared it opens a fortune slip: half the time 20/30/50/100 coins, half the time one random booster, with a short fortune message. Oven Mitt Undo takes the payout back along with the move that earned it. |

**Coins** are a saved counter (`cookies-and-crumbs-coins`) shown on the home and map screens. Nothing spends them yet. Reset progress leaves coins, boosters, the daily streak and the queue alone.

**Daily login reward:** on the first open each local day a 7-day calendar pops up with a Claim button (Later leaves it for the next open). Claiming day 1 to 7: 25 coins, Rolling Pin, 50 coins, Spatula Swap, Sprinkle Shuffle, 100 coins + Extra Scoop, then a **Golden Cookie** queued for the next level. Missing a day starts the streak over at day 1; after day 7 it starts a new cycle. Saved in `cookies-and-crumbs-daily` (`{last, day}`); a clock set back claims nothing.

**Test tools** (Settings, behind `SHOW_TEST_TOOLS`): queue a Golden Cookie, Rainbow Dough or Lucky Fortune for the next level; move the daily clock forward one day (Next day), two days (Miss a day, breaks the streak), jump to a day-7 claim, or reset the daily state. Remove them for publishing by setting `SHOW_TEST_TOOLS = false` (this also stops the daily clock offset from being read).

## Storage keys and test builds

Every localStorage key goes through `storageKey()` in `src/storage.ts` (`cookies-and-crumbs-<name>`). A build made with `VITE_STORAGE_PREFIX=cnc-beta-xxxx` uses its own keys, so a hidden test build on the same origin can't touch the live saves. On first run it copies the live progress and settings once (read only, boosters, coins and daily state are not copied).

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
- Sound and music are described in the Sound section. Pops use scale/fade plus crumb particles.
- Specials on the board: four in a row clears the line, five plants a Cherry Bomb, an L or T of five clears that whole flavor (see Challenge Mode above).
