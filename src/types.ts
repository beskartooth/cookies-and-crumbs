export const COLS = 8;
export const ROWS = 8;

export const COOKIE_IDS = [
  'bear',
  'chocolate-chip',
  'pink-heart',
  'purple',
  'sprinkles',
] as const;

export type FlavorId = (typeof COOKIE_IDS)[number];
/** Playable cookies, plus the cherry bomb that a five-in-a-row leaves behind. */
export type CookieId = FlavorId | 'cherry-bomb';

export type Cell = {
  id: CookieId;
  /** Stable key for animation tracking while on the board. */
  key: number;
  /** Unbroken jar: locked in place, breaks on its first match into a normal cookie. */
  jar?: boolean;
  /** Prize cookie: random flavor, glows, +500 when crushed. Fixed start spot. */
  prize?: boolean;
};

/** Where a jar or prize sits. Leave flavor out for a random cookie each deal. */
export type JarSpot = { col: number; row: number; flavor?: FlavorId };
export type PrizeSpot = { col: number; row: number; flavor?: FlavorId };

export type Pos = { col: number; row: number };

export type Crumb = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number;
  maxLife: number;
};

export const COOKIE_SRC: Record<CookieId, string> = {
  bear: './cookies/bear.png',
  'chocolate-chip': './cookies/chocolate-chip.png',
  'pink-heart': './cookies/pink-heart.png',
  purple: './cookies/purple.png',
  sprinkles: './cookies/sprinkles.png',
  'cherry-bomb': './cookies/cherry-bomb.png',
};

export const JAR_SRC: Record<FlavorId, string> = {
  bear: './cookies/jar-bear.png',
  'chocolate-chip': './cookies/jar-chocolate-chip.png',
  'pink-heart': './cookies/jar-pink-heart.png',
  purple: './cookies/jar-purple.png',
  sprinkles: './cookies/jar-sprinkles.png',
};

/** Warm crumb palette per cookie type. */
export const CRUMB_COLORS: Record<CookieId, string[]> = {
  bear: ['#c9a06a', '#8b5a2b', '#e8c99a', '#5c3a1e'],
  'chocolate-chip': ['#a67c52', '#6b3f1f', '#d4a574', '#3d2412'],
  'pink-heart': ['#e88ba8', '#f5c4d4', '#c45a7a', '#ffe0ea'],
  purple: ['#9b7bb8', '#6e4f8f', '#cbb0e0', '#4a3266'],
  sprinkles: ['#d4a574', '#ff6b6b', '#4ecdc4', '#ffe66d', '#ff8fab'],
  'cherry-bomb': ['#ff4d4d', '#ffd24a', '#ff8a2a', '#7a1020', '#fff1b8'],
};

/** Where the level map should focus after a level clear. */
export type MapFocus = {
  /** 0-based level just cleared. */
  cleared: number;
  /** 0-based level to center on, or null for the "more rooms" marker. */
  next: number | null;
  /** True when this clear unlocked `next` for the first time. */
  unlocked: boolean;
  /** Best stars on the cleared level before and after this clear. */
  starsFrom: number;
  starsTo: number;
};
