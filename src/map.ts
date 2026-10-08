import { CHAPTERS, LEVELS, loadUnlocked, mapStars } from './levels.ts';
import { starIcon, starRow } from './stars.ts';
import { COOKIE_SRC } from './types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Node rim colors by spot in a chapter: teach, practice, twist, then the chapter finale. */
const PHASES = ['teach', 'practice', 'twist', 'boss'] as const;

const NODE = 76; // node diameter, px
const STEP = 112; // vertical gap between nodes
const HEADER = 62; // chapter header height
const BAND_GAP = 30;
const MARKER = 118; // "more rooms" marker block at the top

type Point = { x: number; y: number };

function padlock(className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const shackle = document.createElementNS(SVG_NS, 'path');
  shackle.setAttribute('d', 'M7.5 11V8a4.5 4.5 0 0 1 9 0v3');
  shackle.setAttribute('class', 'lock-shackle');
  const body = document.createElementNS(SVG_NS, 'rect');
  body.setAttribute('x', '4.5');
  body.setAttribute('y', '10.5');
  body.setAttribute('width', '15');
  body.setAttribute('height', '11');
  body.setAttribute('rx', '2.6');
  body.setAttribute('class', 'lock-body');
  svg.append(shackle, body);
  return svg;
}

/** Smooth vertical S-curve through the points, bottom to top. */
function pathThrough(points: Point[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const mid = (a.y - b.y) / 2;
    d += ` C ${a.x} ${a.y - mid} ${b.x} ${b.y + mid} ${b.x} ${b.y}`;
  }
  return d;
}

function svgPath(d: string, className: string): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', className);
  return path;
}

/**
 * Draw the vertical level map: level 1 at the bottom, climbing up through the
 * chapter bands. Returns the node to center on (highest unlocked level).
 */
export function renderLevelMap(
  map: HTMLElement,
  total: HTMLElement,
  onPick: (index: number) => void,
): HTMLElement | null {
  const width = map.clientWidth || 340;
  const unlocked = loadUnlocked();
  const stars = mapStars();
  const amp = Math.min(width * 0.26, 118);
  const xFor = (i: number) => Math.round(width / 2 + amp * Math.sin((i * Math.PI) / 3));

  const centers: Point[] = new Array(LEVELS.length);
  const bands: { top: number; bottom: number; chapter: number }[] = [];

  // Lay out top-down: marker, then chapters from last to first.
  let y = MARKER;
  for (let c = CHAPTERS.length - 1; c >= 0; c--) {
    const ch = CHAPTERS[c]!;
    const top = y;
    let cy = top + HEADER + 30 + NODE / 2;
    for (let i = ch.last; i >= ch.first; i--) {
      centers[i] = { x: xFor(i), y: cy };
      cy += STEP;
    }
    const bottom = cy - STEP + NODE / 2 + 26;
    bands.push({ top, bottom, chapter: c });
    y = bottom + BAND_GAP;
  }
  const height = y;
  const markerPoint: Point = { x: xFor(LEVELS.length), y: 58 };

  map.replaceChildren();
  map.style.height = `${height}px`;

  for (const band of bands) {
    const ch = CHAPTERS[band.chapter]!;
    const el = document.createElement('div');
    el.className = 'map-band';
    el.style.top = `${band.top}px`;
    el.style.height = `${band.bottom - band.top}px`;
    const head = document.createElement('div');
    head.className = 'map-band-head';
    const titles = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.className = 'map-band-kicker';
    kicker.textContent = `Chapter ${band.chapter + 1} · Levels ${ch.first + 1}–${ch.last + 1}`;
    const name = document.createElement('span');
    name.className = 'map-band-name';
    name.textContent = ch.name;
    titles.append(kicker, name);
    let got = 0;
    for (let i = ch.first; i <= ch.last; i++) got += stars[i] ?? 0;
    const count = document.createElement('span');
    count.className = 'map-band-stars';
    count.append(starIcon(true, 'band-star'), ` ${got} / ${(ch.last - ch.first + 1) * 3}`);
    head.append(titles, count);
    el.append(head);
    map.append(el);
  }

  // Dotted path: dim all the way up, bright through the unlocked levels.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map-path');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.append(
    svgPath(pathThrough([...centers, markerPoint]), 'map-path-dim'),
    svgPath(pathThrough(centers.slice(0, unlocked)), 'map-path-lit'),
  );
  map.append(svg);

  // "More rooms coming soon" marker above the last level.
  const marker = document.createElement('div');
  marker.className = 'map-soon';
  marker.style.left = `${markerPoint.x}px`;
  marker.style.top = `${markerPoint.y}px`;
  const ring = document.createElement('div');
  ring.className = 'map-soon-ring';
  ring.append(padlock('map-soon-lock'));
  const soonText = document.createElement('span');
  soonText.className = 'map-soon-text';
  soonText.textContent = 'More rooms coming soon';
  marker.append(ring, soonText);
  map.append(marker);

  let current: HTMLElement | null = null;
  CHAPTERS.forEach((ch) => {
    for (let i = ch.first; i <= ch.last; i++) {
      const number = i + 1;
      const locked = number > unlocked;
      const earned = stars[i] ?? 0;
      const played = earned > 0;
      const isCurrent = number === unlocked;
      const phase = PHASES[Math.min(i - ch.first, PHASES.length - 1)]!;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `map-node phase-${phase}`;
      if (locked) btn.classList.add('is-locked');
      else btn.classList.add('is-open');
      if (played) btn.classList.add('is-played');
      if (isCurrent) btn.classList.add('is-current');
      btn.style.left = `${centers[i]!.x}px`;
      btn.style.top = `${centers[i]!.y}px`;
      btn.dataset.level = String(number);
      btn.disabled = locked;
      btn.setAttribute(
        'aria-label',
        locked
          ? `Level ${number}, locked`
          : `Level ${number}${played ? `, ${earned} of 3 stars` : ''}`,
      );
      btn.title = locked
        ? 'Locked. Clear the one before it~'
        : !played
          ? 'Fresh batch'
          : earned < 3
            ? 'Go for three?'
            : 'Perfect batch';

      const body = document.createElement('span');
      body.className = 'map-node-body';
      const img = document.createElement('img');
      img.className = 'map-node-cookie';
      img.src = COOKIE_SRC[ch.node];
      img.alt = '';
      img.draggable = false;
      const num = document.createElement('span');
      num.className = 'map-node-num';
      num.textContent = String(number);
      body.append(img, num);
      if (locked) body.append(padlock('map-node-lock'));
      btn.append(body);

      if (played) {
        const row = document.createElement('span');
        row.className = 'map-node-stars';
        row.append(...starRow(earned, 'node-star'));
        btn.append(row);
      }

      if (!locked) btn.addEventListener('click', () => onPick(i));
      if (isCurrent) current = btn;
      map.append(btn);
    }
  });

  const sum = stars.reduce((a, b) => a + b, 0);
  total.replaceChildren(starIcon(true, 'band-star'), ` ${sum} / ${LEVELS.length * 3}`);
  total.setAttribute('aria-label', `${sum} of ${LEVELS.length * 3} stars`);
  return current;
}
