# Cookies and Crumbs

A mobile-first Bejeweled-style match-3 browser game. Pieces are cookies. Built for Besky.

Portrait phone first, also works on desktop. Swap adjacent cookies by drag or tap-tap, match 3+ in a row or column, watch them pop into crumbs, and chase cascades for score.

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
