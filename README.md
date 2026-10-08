# Cookies and Crumbs

A mobile-first Bejeweled-style match-3 browser game. Pieces are cookies. Built for Besky.

Portrait phone first, also works on desktop. The home screen offers two modes. Swap adjacent cookies by drag or tap-tap, match 3+ in a row or column, watch them pop into crumbs, and chase cascades for score.

**Challenge Mode** opens the level map: a vertical path you climb from level 1 at the bottom, grouped into chapters (Opening Shift 1–4, Jar Jam 5–8, Showstopper 9–12). Tap any unlocked cookie node to play it. A valid swap costs one move. Cascades are free. Reach the score goal to clear the level; after that the level keeps going until moves run out (or you lock in 3 stars) so you can chase more stars. Going home does not clear the unlocked level. After a clear, **Continue** returns to the map, which glides to the next level, plays the unlock, and marks it with a **Next!** highlight (**Replay** retries the level).

**Stars** (best per level is kept):

- ★ reach the score goal
- ★★ goal + every quest for that level
- ★★★ goal + every quest + at least 1.5× the goal

**Bake-athon!** has no move limit. The score just keeps climbing.

The highest unlocked level is stored in localStorage (`cookies-and-crumbs-unlocked`), and best stars per level in `cookies-and-crumbs-stars` (JSON array).

In `npm run dev` only, `cnc.finish(score, allQuests)` in the console ends the current level for testing.

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
