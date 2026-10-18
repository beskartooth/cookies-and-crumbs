/**
 * Boosters: player-held helpers (Rolling Pin, Spatula Swap, Oven Mitt Undo,
 * Sprinkle Shuffle, Extra Scoop). This file holds the definitions, the saved
 * stock, the icon asset map and the booster bar DOM. The rules live in game.ts.
 */
import type { SfxName } from './audio.ts';
import { storageKey } from './storage.ts';

export const BOOSTER_IDS = [
  'rolling-pin',
  'spatula-swap',
  'oven-mitt-undo',
  'sprinkle-shuffle',
  'extra-scoop',
] as const;

export type BoosterId = (typeof BOOSTER_IDS)[number];

export type BoosterDef = {
  id: BoosterId;
  name: string;
  /** Label under the icon (keep it short). */
  short: string;
  /** One line shown in tooltips and read by screen readers. */
  blurb: string;
  /** Placeholder icon, used until the art file loads. */
  emoji: string;
  /** Targeted boosters are armed first, then you tap the board. */
  targeted: boolean;
  /** Prompt shown above the bar while a targeted booster is armed. */
  prompt?: string;
  /** Existing sound reused for the booster (placeholders, retune freely). */
  sfx: SfxName;
};

export const BOOSTERS: Record<BoosterId, BoosterDef> = {
  'rolling-pin': {
    id: 'rolling-pin',
    name: 'Rolling Pin',
    short: 'Pin',
    blurb: 'Tap a row to flatten the whole row. Costs no move.',
    emoji: '\u{1F956}',
    targeted: true,
    prompt: 'Rolling Pin: tap a row to clear it',
    sfx: 'line-clear',
  },
  'spatula-swap': {
    id: 'spatula-swap',
    name: 'Spatula Swap',
    short: 'Swap',
    blurb: 'Tap any two cookies to swap them. Costs no move.',
    emoji: '\u{1F373}',
    targeted: true,
    prompt: 'Spatula: tap two cookies to swap them',
    sfx: 'swap',
  },
  'oven-mitt-undo': {
    id: 'oven-mitt-undo',
    name: 'Oven Mitt Undo',
    short: 'Undo',
    blurb: 'Take back your last move.',
    emoji: '\u{1F9E4}',
    targeted: false,
    sfx: 'unlock',
  },
  'sprinkle-shuffle': {
    id: 'sprinkle-shuffle',
    name: 'Sprinkle Shuffle',
    short: 'Shuffle',
    blurb: 'Reshuffle the board. Costs no move.',
    emoji: '\u2728',
    targeted: false,
    sfx: 'bomb-plant',
  },
  'extra-scoop': {
    id: 'extra-scoop',
    name: 'Extra Scoop',
    short: 'Scoop',
    blurb: 'Get 5 more moves (levels only).',
    emoji: '\u{1F944}',
    targeted: false,
    sfx: 'quest-done',
  },
};

/**
 * Icon art per booster. Point an entry at a PNG in `public/boosters/` to use
 * it; `null` keeps the emoji placeholder. A file that fails to load falls back
 * to the emoji too.
 */
export const BOOSTER_ICON_SRC: Record<BoosterId, string | null> = {
  'rolling-pin': './boosters/rolling-pin.png',
  'spatula-swap': './boosters/spatula-swap.png',
  'oven-mitt-undo': './boosters/oven-mitt-undo.png',
  'sprinkle-shuffle': './boosters/sprinkle-shuffle.png',
  'extra-scoop': './boosters/extra-scoop.png',
};

/** TEST BUILD: everyone starts with 3 of each. Set to 0 before publishing. */
export const BOOSTER_START_STOCK = 3;
/** TEST BUILD: Settings shows a "Grant test boosters" button. Set false before publishing. */
export const SHOW_TEST_TOOLS = true;
/** Most of one booster a player can hold. */
export const BOOSTER_MAX = 99;
/** Moves the Extra Scoop adds. */
export const SCOOP_MOVES = 5;

export type BoosterStock = Record<BoosterId, number>;

const STOCK_KEY = storageKey('boosters');

function clampCount(n: unknown, fallback: number): number {
  const v = Number(n);
  if (n === null || n === undefined || !Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(BOOSTER_MAX, Math.floor(v)));
}

function emptyStock(fill: number): BoosterStock {
  return Object.fromEntries(BOOSTER_IDS.map((id) => [id, fill])) as BoosterStock;
}

let stock: BoosterStock | null = null;

/**
 * Saved counts, loaded once. A missing key (an old save from before boosters,
 * or a booster added later) starts at BOOSTER_START_STOCK; a bad or blocked
 * save falls back to that too. Never touches stars or unlocks.
 */
function loaded(): BoosterStock {
  if (stock) return stock;
  const next = emptyStock(BOOSTER_START_STOCK);
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      for (const id of BOOSTER_IDS) {
        next[id] = clampCount((parsed as Record<string, unknown>)[id], BOOSTER_START_STOCK);
      }
    }
  } catch {
    /* bad JSON or blocked storage */
  }
  stock = next;
  return next;
}

function persist(): void {
  try {
    localStorage.setItem(STOCK_KEY, JSON.stringify(loaded()));
  } catch {
    /* private mode or blocked storage: counts still work this session */
  }
}

export function boosterCount(id: BoosterId): number {
  return loaded()[id];
}

/** Add (or with a negative number, remove) boosters. Returns the new count. */
export function addBooster(id: BoosterId, by: number): number {
  const s = loaded();
  s[id] = Math.max(0, Math.min(BOOSTER_MAX, s[id] + Math.floor(by)));
  persist();
  return s[id];
}

/** Use one. False when there are none left. */
export function spendBooster(id: BoosterId): boolean {
  if (boosterCount(id) <= 0) return false;
  addBooster(id, -1);
  return true;
}

/** Test tool: add `each` of every booster. */
export function grantTestBoosters(each = 5): void {
  for (const id of BOOSTER_IDS) addBooster(id, each);
}

/** What the bar needs to draw one booster. */
export type BoosterView = {
  count: number;
  /** Looks and acts disabled (a tap explains why). */
  disabled: boolean;
  /** Armed and waiting for a board tap. */
  active: boolean;
  /** Why it is disabled, for the tooltip and the tap message. */
  reason: string;
};

export type BoosterBar = {
  update(views: Record<BoosterId, BoosterView>, prompt: string): void;
};

function iconNode(def: BoosterDef): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'booster-icon';
  wrap.setAttribute('aria-hidden', 'true');
  const emoji = () => {
    wrap.replaceChildren();
    wrap.textContent = def.emoji;
    wrap.classList.add('is-emoji');
  };
  const src = BOOSTER_ICON_SRC[def.id];
  if (src) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', emoji, { once: true });
    img.src = src;
    wrap.append(img);
  } else {
    emoji();
  }
  return wrap;
}

/** Build the booster buttons inside `root` (which should hold a prompt and a row). */
export function createBoosterBar(
  root: HTMLElement,
  onPress: (id: BoosterId) => void,
): BoosterBar {
  const prompt = root.querySelector<HTMLElement>('.booster-prompt');
  const row = root.querySelector<HTMLElement>('.booster-row');
  if (!prompt || !row) throw new Error('Booster bar markup is missing');
  const parts = new Map<BoosterId, { btn: HTMLButtonElement; badge: HTMLElement }>();
  for (const id of BOOSTER_IDS) {
    const def = BOOSTERS[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'booster';
    btn.dataset.booster = id;
    const badge = document.createElement('span');
    badge.className = 'booster-count';
    const label = document.createElement('span');
    label.className = 'booster-name';
    label.textContent = def.short;
    btn.append(iconNode(def), badge, label);
    btn.addEventListener('click', () => onPress(id));
    row.append(btn);
    parts.set(id, { btn, badge });
  }
  return {
    update(views, text) {
      prompt.hidden = text === '';
      prompt.textContent = text;
      for (const id of BOOSTER_IDS) {
        const { btn, badge } = parts.get(id)!;
        const v = views[id];
        const def = BOOSTERS[id];
        badge.textContent = String(v.count);
        btn.classList.toggle('is-active', v.active);
        btn.classList.toggle('is-disabled', v.disabled);
        btn.classList.toggle('is-empty', v.count === 0);
        btn.setAttribute('aria-disabled', String(v.disabled));
        btn.setAttribute('aria-pressed', def.targeted ? String(v.active) : 'false');
        btn.setAttribute(
          'aria-label',
          `${def.name}, ${v.count} left${v.disabled && v.reason ? `, ${v.reason}` : ''}`,
        );
        btn.title = v.disabled && v.reason ? `${def.name}: ${v.reason}` : `${def.name}: ${def.blurb}`;
      }
    },
  };
}
