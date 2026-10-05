import type { JarSpot } from './types.ts';

export type Quest =
  | { kind: 'match4'; count: number }
  | { kind: 'match5'; count: number }
  | { kind: 'best'; over: number }
  | { kind: 'jars'; count: number };

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

/** Points for finishing each quest. */
export const QUEST_POINTS = 50;

export type LevelDef = {
  moves: number;
  goal: number;
  /** Up to three quests per level. */
  quests?: readonly Quest[];
  /** Jarred cookies locked in place at the start of the level. */
  jars?: readonly JarSpot[];
};

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
