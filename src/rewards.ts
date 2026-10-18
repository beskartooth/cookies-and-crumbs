/**
 * Reward cookies, coins and the daily login reward.
 *
 * Reward cookies are special board pieces handed out as rewards, never made by
 * matching: Golden Cookie, Rainbow Dough and Lucky Fortune. They wait in a
 * saved queue and are placed on the board when the player starts a level.
 * The board rules live in game.ts and board.ts.
 */
import { BOOSTERS, BOOSTER_IDS, addBooster, type BoosterId } from './boosters.ts';
import { storageKey } from './storage.ts';

export const REWARD_COOKIE_IDS = ['golden', 'rainbow', 'fortune'] as const;
export type RewardCookieId = (typeof REWARD_COOKIE_IDS)[number];

/** The flag a Golden or Lucky Fortune cookie carries on a normal cookie. */
export type RewardFlag = 'golden' | 'fortune';

export type RewardCookieDef = {
  id: RewardCookieId;
  name: string;
  blurb: string;
  /** Placeholder icon, used until the art file loads. */
  emoji: string;
  /** Art file in `public/rewards/`. A missing file falls back to the emoji. */
  src: string;
};

export const REWARD_COOKIES: Record<RewardCookieId, RewardCookieDef> = {
  golden: {
    id: 'golden',
    name: 'Golden Cookie',
    blurb: 'Clear it for a big bonus.',
    emoji: '\u{1F31F}',
    src: './rewards/golden-cookie.png',
  },
  rainbow: {
    id: 'rainbow',
    name: 'Rainbow Dough',
    blurb: 'Swap it with a cookie to clear every cookie of that flavor.',
    emoji: '\u{1F308}',
    src: './rewards/rainbow-dough.png',
  },
  fortune: {
    id: 'fortune',
    name: 'Lucky Fortune',
    blurb: 'Clear it to open a fortune: coins or a booster.',
    emoji: '\u{1F960}',
    src: './rewards/lucky-fortune.png',
  },
};

/** Bonus points when a Golden Cookie is cleared. */
export const GOLDEN_POINTS = 500;

// ---------- Coins ----------

const COINS_KEY = storageKey('coins');
const COINS_MAX = 999999;

let coins: number | null = null;
const coinListeners: (() => void)[] = [];

function loadedCoins(): number {
  if (coins !== null) return coins;
  let n = 0;
  try {
    const v = Math.floor(Number(localStorage.getItem(COINS_KEY)));
    if (Number.isFinite(v) && v > 0) n = Math.min(v, COINS_MAX);
  } catch {
    /* blocked storage */
  }
  coins = n;
  return n;
}

export function getCoins(): number {
  return loadedCoins();
}

/** Add (or with a negative number, remove) coins. Returns the new total. */
export function addCoins(by: number): number {
  coins = Math.max(0, Math.min(COINS_MAX, loadedCoins() + Math.floor(by)));
  try {
    localStorage.setItem(COINS_KEY, String(coins));
  } catch {
    /* private mode or blocked storage */
  }
  for (const fn of coinListeners) fn();
  return coins;
}

/** Call `fn` whenever the coin total changes. */
export function onCoinsChange(fn: () => void): void {
  coinListeners.push(fn);
}

// ---------- Starting-piece queue ----------

const QUEUE_KEY = storageKey('reward-queue');
const QUEUE_MAX = 9;

/** Reward cookies waiting for the next level, oldest first. */
export function loadQueue(): RewardCookieId[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? 'null');
    if (Array.isArray(parsed)) {
      return parsed
        .filter((v): v is RewardCookieId => REWARD_COOKIE_IDS.includes(v as RewardCookieId))
        .slice(0, QUEUE_MAX);
    }
  } catch {
    /* bad JSON or blocked storage */
  }
  return [];
}

function saveQueue(queue: readonly RewardCookieId[]): void {
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* private mode or blocked storage */
  }
}

export function queueRewardCookie(id: RewardCookieId): void {
  saveQueue([...loadQueue(), id].slice(-QUEUE_MAX));
}

/** Take every queued reward cookie (the next level uses them). */
export function takeQueue(): RewardCookieId[] {
  const queue = loadQueue();
  if (queue.length > 0) saveQueue([]);
  return queue;
}

// ---------- Lucky Fortune ----------

const FORTUNES = [
  'A sweet surprise is near.',
  'Good crumbs come to those who bake.',
  'Your next batch will be golden.',
  'A small treat brings big luck.',
  'Today tastes like victory.',
  'Roll with it. Dough your best.',
  'Someone is thinking of cookies.',
  'Luck is rising in the oven.',
];
const FORTUNE_COINS = [20, 30, 50, 100];

export type FortunePayout = {
  coins: number;
  booster: BoosterId | null;
  /** The slip text. */
  message: string;
  /** Short line for the payout, such as "+50 coins". */
  label: string;
};

/** Roll a Lucky Fortune: half the time coins, half a random booster. Pays it out. */
export function openFortune(): FortunePayout {
  const message = FORTUNES[Math.floor(Math.random() * FORTUNES.length)]!;
  if (Math.random() < 0.5) {
    const n = FORTUNE_COINS[Math.floor(Math.random() * FORTUNE_COINS.length)]!;
    addCoins(n);
    return { coins: n, booster: null, message, label: `+${n} coins` };
  }
  const id = BOOSTER_IDS[Math.floor(Math.random() * BOOSTER_IDS.length)]!;
  addBooster(id, 1);
  return { coins: 0, booster: id, message, label: `+1 ${BOOSTERS[id].name}` };
}

/** Take back a payout (Oven Mitt Undo of the move that earned it). */
export function revokeFortune(p: FortunePayout): void {
  if (p.coins > 0) addCoins(-p.coins);
  if (p.booster) addBooster(p.booster, -1);
}

// ---------- Daily login reward ----------

export type DailyReward = {
  coins?: number;
  boosters?: readonly BoosterId[];
  cookie?: RewardCookieId;
};

/** Day 1 to 7 of the streak. Day 7 is the Golden Cookie. */
export const DAILY_REWARDS: readonly DailyReward[] = [
  { coins: 25 },
  { boosters: ['rolling-pin'] },
  { coins: 50 },
  { boosters: ['spatula-swap'] },
  { boosters: ['sprinkle-shuffle'] },
  { coins: 100, boosters: ['extra-scoop'] },
  { cookie: 'golden' },
];

/** Plain-text label for a day's reward, e.g. "+100 coins, +1 Extra Scoop". */
export function dailyLabel(r: DailyReward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`${r.coins} coins`);
  for (const id of r.boosters ?? []) parts.push(BOOSTERS[id].name);
  if (r.cookie) parts.push(REWARD_COOKIES[r.cookie].name);
  return parts.join(' + ');
}

const DAILY_KEY = storageKey('daily');
const OFFSET_KEY = storageKey('daily-offset');

/** `last` is the local date of the last claim (YYYY-MM-DD), `day` the streak day claimed then (1-7). */
type DailyState = { last: string | null; day: number };

function loadDaily(): DailyState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DAILY_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      const { last, day } = parsed as { last?: unknown; day?: unknown };
      const d = Math.floor(Number(day));
      if (typeof last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(last) && d >= 1 && d <= 7) {
        return { last, day: d };
      }
    }
  } catch {
    /* bad JSON or blocked storage */
  }
  return { last: null, day: 0 };
}

function saveDaily(s: DailyState): void {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(s));
  } catch {
    /* private mode or blocked storage */
  }
}

/** Test tools only: days the clock is moved forward. Ignored when test tools are off. */
function dayOffset(testTools: boolean): number {
  if (!testTools) return 0;
  try {
    const n = Math.floor(Number(localStorage.getItem(OFFSET_KEY)));
    return Number.isFinite(n) ? Math.max(0, Math.min(3650, n)) : 0;
  } catch {
    return 0;
  }
}

/** Local calendar date, `shift` days from today. */
function dateString(offset: number, shift = 0): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0); // noon keeps daylight-saving changes out of the day count
  d.setDate(d.getDate() + offset + shift);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function dayNumber(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86400000);
}

export type DailyStatus = {
  /** True when today's reward hasn't been claimed. */
  due: boolean;
  /** Streak day (1-7) that claiming now gives. */
  day: number;
  /** Days already claimed in this streak (shown ticked). */
  claimed: number;
  /** True when a missed day sent the streak back to day 1. */
  reset: boolean;
};

export function dailyStatus(testTools: boolean): DailyStatus {
  const state = loadDaily();
  const today = dateString(dayOffset(testTools));
  if (!state.last) return { due: true, day: 1, claimed: 0, reset: false };
  const gap = dayNumber(today) - dayNumber(state.last);
  // Same day, or the clock went backwards: nothing to claim.
  if (gap <= 0) return { due: false, day: state.day, claimed: state.day, reset: false };
  if (gap === 1) {
    const day = (state.day % 7) + 1;
    return { due: true, day, claimed: day - 1, reset: false };
  }
  return { due: true, day: 1, claimed: 0, reset: true };
}

/** Claim today's reward: pays it out, queues a reward cookie and saves. Null if not due. */
export function claimDaily(testTools: boolean): { day: number; reward: DailyReward } | null {
  const status = dailyStatus(testTools);
  if (!status.due) return null;
  const reward = DAILY_REWARDS[status.day - 1]!;
  if (reward.coins) addCoins(reward.coins);
  for (const id of reward.boosters ?? []) addBooster(id, 1);
  if (reward.cookie) queueRewardCookie(reward.cookie);
  saveDaily({ last: dateString(dayOffset(testTools)), day: status.day });
  return { day: status.day, reward };
}

/** Test tool: move the clock forward `days`. */
export function advanceDailyDays(days: number): void {
  try {
    localStorage.setItem(OFFSET_KEY, String(dayOffset(true) + Math.max(0, Math.floor(days))));
  } catch {
    /* blocked storage */
  }
}

/** Test tool: pretend the streak is at day 6 as of yesterday, so the next claim is day 7. */
export function setupDailyDay7(): void {
  saveDaily({ last: dateString(dayOffset(true), -1), day: 6 });
}

/** Test tool: forget all daily progress and the clock offset. */
export function resetDaily(): void {
  try {
    localStorage.removeItem(DAILY_KEY);
    localStorage.removeItem(OFFSET_KEY);
  } catch {
    /* blocked storage */
  }
}
