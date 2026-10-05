import type { JarSpot } from './types.ts';

export type QuestId = 'match4' | 'match5' | 'best300';

export const QUEST_LABEL: Record<QuestId, string> = {
  match4: 'Match four',
  match5: 'Match five',
  best300: 'Best move over 300!',
};

/** Points for finishing each quest. */
export const QUEST_POINTS = 50;

export type LevelDef = {
  moves: number;
  goal: number;
  /** Up to three quests per level. */
  quests?: readonly QuestId[];
  /** Jarred cookies locked in place at the start of the level. */
  jars?: readonly JarSpot[];
};

export const LEVELS: readonly LevelDef[] = [
  { moves: 30, goal: 800, quests: ['match4'] },
  { moves: 26, goal: 1200, quests: ['match5'] },
  { moves: 22, goal: 1600, quests: ['match4', 'match5', 'best300'] },
  { moves: 18, goal: 2000, quests: ['match4', 'match5', 'best300'] },
  {
    moves: 20,
    goal: 2200,
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
