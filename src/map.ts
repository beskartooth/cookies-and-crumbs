import { CHAPTERS, LEVELS, loadUnlocked, mapStars, phaseOf } from './levels.ts';
import { starIcon, starRow } from './stars.ts';
import { COOKIE_SRC, type MapFocus } from './types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

const NODE = 76; // node diameter, px
const BOSS = 100; // boss node diameter, px
const BOSS_GAP = 18; // extra space under a boss node
const STEP = 128; // vertical gap between nodes (room for the Next! marker)
const HEADER = 62; // chapter header height
const BAND_GAP = 30;
const MARKER = 118; // "more rooms" marker block at the top

type Point = { x: number; y: number };

export type MapView = {
  map: HTMLElement;
  nodes: HTMLButtonElement[];
  soon: HTMLElement;
  /** Frontier node (highest unlocked), or null once every level is cleared. */
  current: HTMLElement | null;
  /** Bright path piece into a level that is about to unlock. */
  newPath: SVGPathElement | null;
  gen: number;
};

export type MapOptions = {
  /** Draw this level still locked so the unlock can play. */
  unlocking?: number;
  /** Stars on this level from `from` up are new and pop in. */
  newStars?: { index: number; from: number };
};

/** Bumped on every render so stale animations stop. */
let renderGen = 0;

function nextMarker(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'map-node-marker';
  el.textContent = 'Next!';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

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
  opts: MapOptions = {},
): MapView {
  const gen = ++renderGen;
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
    // Room above the band's top node for its star slots or the Next! marker.
    // The boss sits at the top of its band (the band's last level).
    let cy = top + HEADER + 58 + BOSS / 2;
    for (let i = ch.last; i >= ch.first; i--) {
      centers[i] = { x: xFor(i), y: cy };
      cy += STEP + (i === ch.last ? BOSS_GAP : 0);
    }
    const bottom = cy - STEP + NODE / 2 + 26;
    bands.push({ top, bottom, chapter: c });
    y = bottom + BAND_GAP;
  }
  const height = y;
  const markerPoint: Point = { x: xFor(LEVELS.length), y: 64 };

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
  const unlocking = opts.unlocking;
  const pending = unlocking !== undefined && unlocking > 0 && unlocking < unlocked;
  const litTo = pending ? unlocking : unlocked;
  svg.append(
    svgPath(pathThrough([...centers, markerPoint]), 'map-path-dim'),
    svgPath(pathThrough(centers.slice(0, litTo)), 'map-path-lit'),
  );
  let newPath: SVGPathElement | null = null;
  if (pending) {
    newPath = svgPath(
      pathThrough([centers[unlocking - 1]!, centers[unlocking]!]),
      'map-path-lit map-path-new',
    );
    svg.append(newPath);
  }
  map.append(svg);
  const allDone = unlocked >= LEVELS.length && (stars[LEVELS.length - 1] ?? 0) > 0;

  // "More rooms coming soon" marker above the last level.
  const marker = document.createElement('div');
  marker.className = allDone ? 'map-soon is-next' : 'map-soon';
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
  const nodes: HTMLButtonElement[] = [];
  CHAPTERS.forEach((ch) => {
    for (let i = ch.first; i <= ch.last; i++) {
      const number = i + 1;
      const held = pending && i === unlocking;
      const locked = number > unlocked || held;
      const earned = stars[i] ?? 0;
      const played = earned > 0;
      const isCurrent = number === unlocked && !allDone;
      const phase = phaseOf(i);
      const boss = phase === 'boss';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `map-node phase-${phase}`;
      if (boss) btn.classList.add('is-boss');
      if (locked) btn.classList.add('is-locked');
      else btn.classList.add('is-open');
      if (held) btn.classList.add('is-unlocking');
      if (played) btn.classList.add('is-played');
      if (isCurrent && !held) btn.classList.add('is-current', 'is-next');
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
      if (boss) btn.setAttribute('aria-label', `${btn.getAttribute('aria-label')}, boss: ${ch.boss}`);
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

      if (boss) {
        // Nameplate beside the boss, on the side toward the middle of the map.
        const plate = document.createElement('span');
        plate.className = `map-boss-plate ${centers[i]!.x > width / 2 ? 'on-left' : 'on-right'}`;
        const tag = document.createElement('span');
        tag.className = 'map-boss-tag';
        tag.textContent = 'Boss';
        const bossName = document.createElement('span');
        bossName.className = 'map-boss-name';
        bossName.textContent = ch.boss;
        plate.append(tag, bossName);
        btn.append(plate);
      }

      if (played) {
        const row = document.createElement('span');
        row.className = 'map-node-stars';
        const icons = starRow(earned, 'node-star');
        const fresh = opts.newStars;
        if (fresh && fresh.index === i) {
          icons.forEach((icon, k) => {
            if (k >= fresh.from && k < earned) icon.classList.add('is-new');
          });
          if (fresh.from >= earned) row.classList.add('is-shine');
        }
        row.append(...icons);
        btn.append(row);
      }
      if (isCurrent && !held) btn.append(nextMarker());

      // Held nodes get their listener now and switch on when the unlock ends.
      if (!locked || held) btn.addEventListener('click', () => onPick(i));
      if (isCurrent) current = btn;
      nodes.push(btn);
      map.append(btn);
    }
  });

  const sum = stars.reduce((a, b) => a + b, 0);
  total.replaceChildren(starIcon(true, 'band-star'), ` ${sum} / ${LEVELS.length * 3}`);
  total.setAttribute('aria-label', `${sum} of ${LEVELS.length * 3} stars`);
  return { map, nodes, soon: marker, current, newPath, gen };
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function scrollTargetFor(el: Element): number {
  const r = el.getBoundingClientRect();
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const y = window.scrollY + r.top + r.height / 2 - window.innerHeight / 2;
  return Math.max(0, Math.min(max, Math.round(y)));
}

/** Center an element on the page right away. */
export function centerOn(el: Element): void {
  window.scrollTo({ top: scrollTargetFor(el), behavior: 'instant' });
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function stale(view: MapView): boolean {
  return view.gen !== renderGen || !view.map.isConnected || view.map.offsetParent === null;
}

/** Ease the page scroll so the element is centered. */
function glideTo(view: MapView, el: Element, ms: number): Promise<void> {
  const from = window.scrollY;
  const to = scrollTargetFor(el);
  if (Math.abs(to - from) < 2) return Promise.resolve();
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now: number) => {
      if (stale(view)) return resolve();
      const t = Math.min(1, (now - t0) / ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      window.scrollTo({ top: from + (to - from) * e, behavior: 'instant' });
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** Finish an unlock: node goes live, gets the Next! marker. */
function settleUnlocked(view: MapView, node: HTMLButtonElement): void {
  node.classList.remove('is-unlocking', 'unlock-go', 'is-bouncing', 'is-locked');
  node.classList.add('is-open', 'is-current', 'is-next', 'is-arriving');
  node.disabled = false;
  node.querySelector('.map-node-lock')?.remove();
  if (!node.querySelector('.map-node-marker')) node.append(nextMarker());
  const n = node.dataset.level;
  node.setAttribute('aria-label', `Level ${n}`);
  node.title = 'Fresh batch';
  view.newPath?.classList.add('is-on');
}

/**
 * After a level clear: start on the cleared node (its new stars pop), glide to
 * the next level, play the unlock if it is new, then leave the Next! highlight.
 */
export async function playReturn(view: MapView, focus: MapFocus): Promise<void> {
  const target: HTMLElement =
    focus.next === null ? view.soon : (view.nodes[focus.next] ?? view.soon);
  const unlockNode = focus.unlocked && focus.next !== null ? view.nodes[focus.next] : undefined;
  const fromNode = view.nodes[focus.cleared];

  if (prefersReducedMotion()) {
    if (unlockNode) settleUnlocked(view, unlockNode);
    centerOn(target);
    return;
  }

  if (fromNode) centerOn(fromNode);
  await wait(focus.starsTo > focus.starsFrom ? 900 : 450);
  if (stale(view)) return;
  await glideTo(view, target, 650);
  if (stale(view) || !unlockNode) return;

  await wait(150);
  if (stale(view)) return;
  // Padlock pops off, color floods in, path brightens.
  unlockNode.classList.add('unlock-go');
  unlockNode.classList.remove('is-locked');
  unlockNode.classList.add('is-open');
  view.newPath?.classList.add('is-on');
  await wait(380);
  if (stale(view)) return;
  unlockNode.classList.add('is-bouncing');
  await wait(560);
  if (stale(view)) return;
  settleUnlocked(view, unlockNode);
}
