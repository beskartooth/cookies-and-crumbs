import type { JarSpot, PrizeSpot } from './types.ts';

export type Quest =
  | { kind: 'match4'; count: number }
  | { kind: 'match5'; count: number }
  | { kind: 'best'; over: number }
  | { kind: 'jars'; count: number }
  | { kind: 'prize'; count: number };

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

export const LEVELS: readonly LevelDef[] = [
  { moves: 30, goal: 800, quests: [m4()] },
  { moves: 26, goal: 1200, quests: [m5()] },
  { moves: 22, goal: 1600, quests: [m4(), m5(), best(300)] },
  { moves: 18, goal: 2000, quests: [m4(2), m5(), best(350)] },
  {
    moves: 20,
    goal: 2200,
    quests: [jars(4), m4(2), best(400)],
    jars: [
      { col: 1, row: 1 },
      { col: 6, row: 1 },
      { col: 1, row: 6 },
      { col: 6, row: 6 },
    ],
  },
  {
    moves: 18,
    goal: 2400,
    quests: [jars(6), m5(), best(450)],
    jars: [
      { col: 1, row: 1 },
      { col: 6, row: 1 },
      { col: 1, row: 6 },
      { col: 6, row: 6 },
      { col: 3, row: 3 },
      { col: 4, row: 4 },
    ],
  },
  {
    moves: 16,
    goal: 2600,
    quests: [jars(8), m4(3), best(500)],
    jars: [
      { col: 1, row: 1 },
      { col: 6, row: 1 },
      { col: 1, row: 6 },
      { col: 6, row: 6 },
      { col: 3, row: 2 },
      { col: 4, row: 2 },
      { col: 3, row: 5 },
      { col: 4, row: 5 },
    ],
  },
  {
    moves: 14,
    goal: 2800,
    quests: [jars(10), m5(2), best(550)],
    jars: [
      { col: 1, row: 1 },
      { col: 6, row: 1 },
      { col: 1, row: 6 },
      { col: 6, row: 6 },
      { col: 3, row: 2 },
      { col: 4, row: 2 },
      { col: 3, row: 5 },
      { col: 4, row: 5 },
      { col: 0, row: 4 },
      { col: 7, row: 3 },
    ],
  },
  {
    moves: 16,
    goal: 3000,
    quests: [prize(), jars(8), best(450)],
    prizes: [{ col: 3, row: 3 }],
    jars: [
      { col: 2, row: 2 },
      { col: 3, row: 2 },
      { col: 4, row: 2 },
      { col: 2, row: 3 },
      { col: 4, row: 3 },
      { col: 2, row: 4 },
      { col: 3, row: 4 },
      { col: 4, row: 4 },
    ],
  },
  // Level 10: jar barrier near bottom; prize trapped underneath.
  {
    moves: 15,
    goal: 3200,
    quests: [prize(), jars(6), best(500)],
    prizes: [{ col: 3, row: 6 }],
    jars: [
      { col: 1, row: 5 },
      { col: 2, row: 5 },
      { col: 3, row: 5 },
      { col: 4, row: 5 },
      { col: 5, row: 5 },
      { col: 6, row: 5 },
    ],
  },
  // Level 11: prize on the left; L-shaped jar wall blocks easy access.
  {
    moves: 14,
    goal: 3400,
    quests: [prize(), jars(8), best(500)],
    prizes: [{ col: 1, row: 4 }],
    jars: [
      { col: 2, row: 1 },
      { col: 2, row: 2 },
      { col: 2, row: 3 },
      { col: 2, row: 4 },
      { col: 2, row: 5 },
      { col: 0, row: 5 },
      { col: 1, row: 5 },
      { col: 3, row: 5 },
    ],
  },
  // Level 12: prize near top-right; denser jars, tighter moves.
  {
    moves: 12,
    goal: 3600,
    quests: [prize(), jars(10), m5()],
    prizes: [{ col: 6, row: 1 }],
    jars: [
      { col: 5, row: 0 },
      { col: 5, row: 1 },
      { col: 5, row: 2 },
      { col: 6, row: 2 },
      { col: 7, row: 2 },
      { col: 4, row: 1 },
      { col: 4, row: 3 },
      { col: 2, row: 2 },
      { col: 3, row: 5 },
      { col: 6, row: 5 },
    ],
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
