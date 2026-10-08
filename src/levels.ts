import type { FlavorId, JarSpot, PrizeSpot } from './types.ts';

export type Quest =
  | { kind: 'match4'; count: number }
  | { kind: 'match5'; count: number }
  | { kind: 'best'; over: number }
  | { kind: 'jars'; count: number }
  | { kind: 'prize'; count: number }
  | { kind: 'color'; count: number };

export function questLabel(q: Quest): string {
  switch (q.kind) {
    case 'match4':
      return q.count > 1 ? `Match four ×${q.count}` : 'Match four';
    case 'match5':
      return q.count > 1 ? `Match five ×${q.count}` : 'Match five';
    case 'best':
      return `Best move over ${q.over}!`;
    case 'jars':
      return `Smash ${q.count} Jars`;
    case 'prize':
      return q.count > 1 ? `Claim ${q.count} prizes` : 'Claim the prize';
    case 'color':
      return q.count > 1 ? `Flavor clear ×${q.count}` : 'Flavor clear';
  }
}

/** How many of something a quest needs (best-move quests are a single hit). */
export function questTarget(q: Quest): number {
  return q.kind === 'best' ? 1 : q.count;
}

const m4 = (count = 1): Quest => ({ kind: 'match4', count });
const m5 = (count = 1): Quest => ({ kind: 'match5', count });
const best = (over: number): Quest => ({ kind: 'best', over });
const jars = (count: number): Quest => ({ kind: 'jars', count });
const prize = (count = 1): Quest => ({ kind: 'prize', count });

/** Points for finishing each quest. */
export const QUEST_POINTS = 50;

export type LevelDef = {
  moves: number;
  goal: number;
  /** Up to three quests per level. */
  quests?: readonly Quest[];
  /** Jarred cookies locked in place at the start of the level. */
  jars?: readonly JarSpot[];
  /** Prize cookies that start on fixed cells. Random flavor each deal. */
  prizes?: readonly PrizeSpot[];
};

/** Bonus when a prize cookie is crushed. */
export const PRIZE_POINTS = 500;

/** Jar spots from [col, row] pairs. */
const at = (...cells: [number, number][]): JarSpot[] => cells.map(([col, row]) => ({ col, row }));
/** A straight run of jars in one row, cols c0..c1. */
const hLine = (row: number, c0: number, c1: number): [number, number][] =>
  Array.from({ length: c1 - c0 + 1 }, (_, i) => [c0 + i, row]);
/** A straight run of jars in one column, rows r0..r1. */
const vLine = (col: number, r0: number, r1: number): [number, number][] =>
  Array.from({ length: r1 - r0 + 1 }, (_, i) => [col, r0 + i]);
const color = (count = 1): Quest => ({ kind: 'color', count });

/*
 * 45 levels in three chapters of 15: Teach (1-3), Practice (4-7), Twist (8-10),
 * Mix (11-14), Boss (15). Goals come from the balance sim (greedy bot, many
 * seeds) so the win rate falls smoothly through each chapter and eases after
 * every boss. Levels keep going after the goal, so goals sit well above what a
 * single lucky cascade gives.
 */
export const LEVELS: readonly LevelDef[] = [
  // ---- Chapter 1: Opening Shift (specials only) ----
  // Teach: the original first three levels.
  { moves: 24, goal: 10500, quests: [m4()] },
  { moves: 24, goal: 10500, quests: [m5()] },
  { moves: 23, goal: 12000, quests: [m4(), m5(), best(300)] },
  // Practice
  { moves: 23, goal: 12500, quests: [m4(2), m5(), best(350)] },
  { moves: 22, goal: 12500, quests: [m4(3), best(400)] },
  { moves: 22, goal: 13000, quests: [m5(2), best(450)] },
  { moves: 21, goal: 14000, quests: [m4(2), m5(2), best(500)] },
  // Twist: flavor clears and stacked quests.
  { moves: 21, goal: 14000, quests: [color(), m4()] },
  { moves: 21, goal: 15000, quests: [m5(3), best(500)] },
  { moves: 20, goal: 15500, quests: [color(), best(800)] },
  // Mix
  { moves: 20, goal: 15500, quests: [m4(3), m5(2), best(600)] },
  { moves: 20, goal: 16500, quests: [color(2), m5()] },
  { moves: 19, goal: 16500, quests: [m4(3), color(), best(700)] },
  { moves: 19, goal: 17000, quests: [m5(3), color(), best(800)] },
  // Boss: The Morning Rush
  { moves: 20, goal: 21500, quests: [m5(2), color(2), best(900)] },

  // ---- Chapter 2: Jar Jam ----
  // Teach: the original jar levels, corners toward the center.
  { moves: 25, goal: 11000, quests: [jars(4), m4(2), best(400)], jars: at([1, 1], [6, 1], [1, 6], [6, 6]) },
  {
    moves: 25, goal: 11500, quests: [jars(6), m5(), best(450)],
    jars: at([1, 1], [6, 1], [1, 6], [6, 6], [3, 3], [4, 4]),
  },
  {
    moves: 26, goal: 11500, quests: [jars(8), m4(3), best(500)],
    jars: at([1, 1], [6, 1], [1, 6], [6, 6], [3, 2], [4, 2], [3, 5], [4, 5]),
  },
  // Practice
  {
    moves: 24, goal: 13000, quests: [jars(10), m5(2), best(550)],
    jars: at([1, 1], [6, 1], [1, 6], [6, 6], [3, 2], [4, 2], [3, 5], [4, 5], [0, 4], [7, 3]),
  },
  // Two short shelves.
  { moves: 23, goal: 13000, quests: [jars(8), m4(2)], jars: at(...hLine(2, 2, 5), ...hLine(5, 2, 5)) },
  // Jars along the floor.
  { moves: 23, goal: 14000, quests: [jars(8), m5()], jars: at(...hLine(7, 0, 7)) },
  // Checker band through the middle plus corners.
  {
    moves: 22, goal: 13500, quests: [jars(12), best(600)],
    jars: at([0, 3], [2, 3], [4, 3], [6, 3], [1, 4], [3, 4], [5, 4], [7, 4], [1, 1], [6, 1], [1, 6], [6, 6]),
  },
  // Twist: shapes.
  // Ring around the middle.
  {
    moves: 22, goal: 13500, quests: [jars(12), m4(2)],
    jars: at(...hLine(2, 2, 5), ...hLine(5, 2, 5), [2, 3], [2, 4], [5, 3], [5, 4]),
  },
  // Big X.
  {
    moves: 22, goal: 14000, quests: [jars(12), m5()],
    jars: at([1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [6, 1], [5, 2], [4, 3], [3, 4], [2, 5], [1, 6]),
  },
  // Two pillars.
  { moves: 21, goal: 14000, quests: [jars(12), best(700)], jars: at(...vLine(1, 1, 6), ...vLine(6, 1, 6)) },
  // Mix: shapes plus specials quests.
  // Four 2x2 clusters.
  {
    moves: 21, goal: 14000, quests: [jars(16), m4(2), color()],
    jars: at(
      [1, 1], [2, 1], [1, 2], [2, 2], [5, 1], [6, 1], [5, 2], [6, 2],
      [1, 5], [2, 5], [1, 6], [2, 6], [5, 5], [6, 5], [5, 6], [6, 6],
    ),
  },
  // Cross.
  {
    moves: 21, goal: 14000, quests: [jars(13), m5(2), best(700)],
    jars: at(...hLine(3, 1, 6), ...vLine(4, 0, 2), ...vLine(4, 4, 7)),
  },
  // Two staircases.
  {
    moves: 20, goal: 15500, quests: [jars(14), color(), m4(2)],
    jars: at(
      [0, 6], [1, 5], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0],
      [1, 7], [2, 6], [3, 5], [4, 4], [5, 3], [6, 2], [7, 1],
    ),
  },
  // Offset half walls.
  { moves: 21, goal: 15500, quests: [jars(10), m5(2), color()], jars: at(...hLine(2, 0, 4), ...hLine(5, 3, 7)) },
  // Boss: Lid Lock, a giant jar with its lid on.
  {
    moves: 21, goal: 16500, quests: [jars(18), m4(2), best(900)],
    jars: at(...hLine(1, 2, 5), ...vLine(1, 3, 6), ...vLine(6, 3, 6), ...hLine(7, 1, 6)),
  },

  // ---- Chapter 3: Showstopper (prize cookies) ----
  // Teach: the original prize levels.
  {
    moves: 25, goal: 10500, quests: [prize(), jars(8), best(450)], prizes: [{ col: 3, row: 3 }],
    jars: at([2, 2], [3, 2], [4, 2], [2, 3], [4, 3], [2, 4], [3, 4], [4, 4]),
  },
  {
    moves: 25, goal: 12000, quests: [prize(), jars(6), best(500)], prizes: [{ col: 3, row: 6 }],
    jars: at(...hLine(5, 1, 6)),
  },
  {
    moves: 24, goal: 12000, quests: [prize(), jars(8), best(500)], prizes: [{ col: 1, row: 4 }],
    jars: at(...vLine(2, 1, 5), [0, 5], [1, 5], [3, 5]),
  },
  // Practice
  {
    moves: 24, goal: 12500, quests: [prize(), jars(10), m5()], prizes: [{ col: 6, row: 1 }],
    jars: at([5, 0], [5, 1], [5, 2], [6, 2], [7, 2], [4, 1], [4, 3], [2, 2], [3, 5], [6, 5]),
  },
  // Prize on the floor under a little cap.
  {
    moves: 23, goal: 13500, quests: [prize(), jars(4), m4(2)], prizes: [{ col: 3, row: 7 }],
    jars: at([2, 6], [3, 6], [4, 6], [3, 5]),
  },
  // Corner prize boxed in.
  {
    moves: 23, goal: 14000, quests: [prize(), jars(5), m5()], prizes: [{ col: 0, row: 7 }],
    jars: at([0, 6], [1, 6], [1, 7], [2, 7], [0, 5]),
  },
  // Prize under a jar stack.
  {
    moves: 22, goal: 15000, quests: [prize(), jars(5), best(700)], prizes: [{ col: 3, row: 6 }],
    jars: at(...vLine(3, 3, 5), [2, 6], [4, 6]),
  },
  // Twist
  // Two prizes, two caps.
  {
    moves: 22, goal: 15000, quests: [prize(2), jars(6), m4(2)],
    prizes: [{ col: 1, row: 6 }, { col: 6, row: 6 }],
    jars: at([1, 5], [6, 5], [0, 6], [2, 6], [5, 6], [7, 6]),
  },
  // Prizes perched in the top corners.
  {
    moves: 22, goal: 16000, quests: [prize(2), jars(6), m5()],
    prizes: [{ col: 0, row: 0 }, { col: 7, row: 0 }],
    jars: at([0, 1], [1, 0], [1, 1], [7, 1], [6, 0], [6, 1]),
  },
  // Deep stack over a floor prize.
  {
    moves: 21, goal: 16000, quests: [prize(), jars(8), best(800)], prizes: [{ col: 4, row: 7 }],
    jars: at(...vLine(4, 3, 6), [3, 7], [5, 7], [3, 6], [5, 6]),
  },
  // Mix
  // Twin prizes in jar diamonds.
  {
    moves: 21, goal: 16000, quests: [prize(2), m5(2), best(700)],
    prizes: [{ col: 1, row: 3 }, { col: 6, row: 3 }],
    jars: at([1, 2], [1, 4], [0, 3], [2, 3], [6, 2], [6, 4], [5, 3], [7, 3]),
  },
  // Glass case: prize ringed twice over the top.
  {
    moves: 21, goal: 16000, quests: [prize(), jars(11), m4(3)], prizes: [{ col: 3, row: 4 }],
    jars: at(...hLine(2, 2, 4), ...hLine(3, 2, 4), [2, 4], [4, 4], ...hLine(5, 2, 4)),
  },
  // Three prizes along the floor.
  {
    moves: 20, goal: 17000, quests: [prize(3), jars(6), color()],
    prizes: [{ col: 1, row: 7 }, { col: 4, row: 7 }, { col: 6, row: 7 }],
    jars: at([1, 6], [4, 6], [6, 6], [2, 6], [3, 5], [5, 5]),
  },
  // Prize up top behind a diagonal wall.
  {
    moves: 20, goal: 17000, quests: [prize(), jars(8), color()], prizes: [{ col: 6, row: 1 }],
    jars: at([5, 0], [5, 1], [5, 2], [6, 2], [7, 2], [4, 3], [3, 4], [2, 5]),
  },
  // Boss: Behind the Glass. Three prizes behind heavy walls.
  {
    moves: 21, goal: 20000, quests: [prize(3), jars(14), best(1000)],
    prizes: [{ col: 2, row: 7 }, { col: 5, row: 7 }, { col: 3, row: 2 }],
    jars: at(
      [1, 7], [3, 7], [1, 6], [2, 6], [3, 6],
      [4, 7], [6, 7], [4, 6], [5, 6], [6, 6],
      [3, 3], [2, 2], [4, 2], [3, 1],
    ),
  },
];

const STORAGE_KEY = 'cookies-and-crumbs-unlocked';

/** Highest unlocked level, 1-based. */
export function loadUnlocked(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) return 1;
    return Math.min(n, LEVELS.length);
  } catch {
    return 1;
  }
}

export function saveUnlocked(level: number): void {
  const next = Math.max(1, Math.min(LEVELS.length, Math.floor(level)));
  try {
    const prev = loadUnlocked();
    localStorage.setItem(STORAGE_KEY, String(Math.max(prev, next)));
  } catch {
    /* private mode or blocked storage */
  }
}

/** Chapter bands on the level map. Indexes are 0-based and inclusive. */
export type Chapter = {
  name: string;
  room: string;
  first: number;
  last: number;
  /** Cookie sprite used for this chapter's map nodes. */
  node: FlavorId;
  /** Name of the chapter's last (boss) level. */
  boss: string;
};

export const CHAPTERS: readonly Chapter[] = [
  { name: 'Opening Shift', room: 'Storefront Counter', first: 0, last: 14, node: 'bear', boss: 'The Morning Rush' },
  { name: 'Jar Jam', room: 'Cookie Jar Pantry', first: 15, last: 29, node: 'chocolate-chip', boss: 'Lid Lock' },
  { name: 'Showstopper', room: 'Prize Display Case', first: 30, last: 44, node: 'pink-heart', boss: 'Behind the Glass' },
];

/** Spot of a level inside its chapter: Teach, Practice, Twist, Mix, then the Boss. */
export type Phase = 'teach' | 'practice' | 'twist' | 'mix' | 'boss';

export function phaseOf(index: number): Phase {
  const ch = CHAPTERS.find((c) => index >= c.first && index <= c.last);
  const k = ch ? index - ch.first : 0;
  if (ch && index === ch.last) return 'boss';
  if (k < 3) return 'teach';
  if (k < 7) return 'practice';
  if (k < 10) return 'twist';
  return 'mix';
}

/** The chapter whose boss is this level, if any. */
export function bossChapter(index: number): Chapter | undefined {
  return CHAPTERS.find((c) => c.last === index);
}

/** Score needed for the third star. */
export function threeStarScore(level: LevelDef): number {
  return Math.ceil(level.goal * 1.5);
}

/**
 * 1 star: reach the goal. 2 stars: goal plus every quest (or just the goal when
 * a level has no quests). 3 stars: all of that plus 1.5x the goal.
 */
export function starsFor(level: LevelDef, score: number, questsDone: number): number {
  if (score < level.goal) return 0;
  const allQuests = questsDone >= (level.quests?.length ?? 0);
  if (!allQuests) return 1;
  return score >= threeStarScore(level) ? 3 : 2;
}

const STARS_KEY = 'cookies-and-crumbs-stars';

/** Best stars per level (0-3), as saved. Index is the 0-based level. */
export function loadStars(): number[] {
  const out = LEVELS.map(() => 0);
  try {
    const raw = localStorage.getItem(STARS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      parsed.forEach((v, i) => {
        const n = Number(v);
        if (i < out.length && Number.isFinite(n)) out[i] = Math.max(0, Math.min(3, Math.floor(n)));
      });
    }
  } catch {
    /* bad JSON or blocked storage */
  }
  return out;
}

/** Save stars for a level only if they beat the saved best. Returns the best. */
export function saveStars(index: number, stars: number): number {
  const all = loadStars();
  if (index < 0 || index >= all.length) return 0;
  const next = Math.max(all[index]!, Math.max(0, Math.min(3, Math.floor(stars))));
  if (next === all[index]) return next;
  all[index] = next;
  try {
    localStorage.setItem(STARS_KEY, JSON.stringify(all));
  } catch {
    /* private mode or blocked storage */
  }
  return next;
}

/** Best stars per level for the map and totals. */
export function mapStars(): number[] {
  return loadStars();
}

const SAVE_VERSION_KEY = 'cookies-and-crumbs-save-version';
const SAVE_VERSION = 2;

/** Where each level of the old 12-level set lives in the 45-level set (0-based). */
export function oldToNewIndex(old: number): number {
  return old < 4 ? old : old < 8 ? old + 11 : old + 22;
}

/**
 * One-time save upgrade from the 12-level set (v1) to 45 levels (v2).
 * Old levels 1-4 stay 1-4, 5-8 become 16-19, 9-12 become 31-34, for both the
 * stars and the highest unlock. Levels cleared before stars existed keep one
 * star. A clear of old level 12 opens the level after it (35). Runs once.
 */
export function migrateSaves(): void {
  try {
    if (Number(localStorage.getItem(SAVE_VERSION_KEY)) >= SAVE_VERSION) return;
    const rawUnlocked = localStorage.getItem(STORAGE_KEY);
    const rawStars = localStorage.getItem(STARS_KEY);
    if (rawUnlocked !== null || rawStars !== null) {
      const u = Math.max(1, Math.min(12, Math.floor(Number(rawUnlocked)) || 1));
      let old: unknown = null;
      try {
        old = rawStars ? JSON.parse(rawStars) : null;
      } catch {
        old = null;
      }
      const oldStars = Array.isArray(old) ? old.slice(0, 12).map((v) => Number(v) || 0) : [];
      const stars = LEVELS.map(() => 0);
      let unlocked = oldToNewIndex(u - 1) + 1;
      for (let i = 0; i < 12; i++) {
        let s = Math.max(0, Math.min(3, Math.floor(oldStars[i] ?? 0)));
        if (i + 1 < u) s = Math.max(1, s); // cleared before stars existed
        stars[oldToNewIndex(i)] = s;
        if (s > 0) unlocked = Math.max(unlocked, oldToNewIndex(i) + 2);
      }
      unlocked = Math.min(LEVELS.length, unlocked);
      localStorage.setItem(STORAGE_KEY, String(unlocked));
      localStorage.setItem(STARS_KEY, JSON.stringify(stars));
    }
    localStorage.setItem(SAVE_VERSION_KEY, String(SAVE_VERSION));
  } catch {
    /* private mode or blocked storage */
  }
}

/**
 * Wipe per-player progress: highest unlock and best stars. (No other progress
 * is stored; Bake-athon keeps no best score.) The save stays marked v2 so the
 * old-save migration never runs on a fresh start. Returns false if storage
 * is blocked.
 */
export function resetProgress(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STARS_KEY);
    localStorage.setItem(SAVE_VERSION_KEY, String(SAVE_VERSION));
    return true;
  } catch {
    return false;
  }
}
