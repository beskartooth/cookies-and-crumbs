/**
 * Reward cookies, Credits and the daily login reward.
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
    blurb: 'Clear it to open a fortune: credits or a booster.',
    emoji: '\u{1F960}',
    src: './rewards/lucky-fortune.png',
  },
};

/** Bonus points when a Golden Cookie is cleared. */
export const GOLDEN_POINTS = 500;

// ---------- Credits ----------
//
// Credits are the one currency: earned from the daily login (days 1-6) and
// Lucky Fortunes, spent in the Shop (src/shop.ts). They used to be called
// "coins"; the saved key is still `<prefix>-coins`, so every existing coin
// balance simply shows up as the same number of credits (1:1, nothing to
// migrate and nothing to lose if a player goes back to an older build).

const CREDITS_KEY = storageKey('coins');
export const CREDITS_MAX = 999999;

let credits: number | null = null;
const creditListeners: ((delta: number) => void)[] = [];

function loadedCredits(): number {
  if (credits !== null) return credits;
  let n = 0;
  try {
    const v = Math.floor(Number(localStorage.getItem(CREDITS_KEY)));
    if (Number.isFinite(v) && v > 0) n = Math.min(v, CREDITS_MAX);
  } catch {
    /* blocked storage */
  }
  credits = n;
  return n;
}

export function getCredits(): number {
  return loadedCredits();
}

/** Add (or with a negative number, remove) credits. Never goes below 0. Returns the new total. */
export function addCredits(by: number): number {
  const before = loadedCredits();
  credits = Math.max(0, Math.min(CREDITS_MAX, before + Math.floor(by)));
  try {
    localStorage.setItem(CREDITS_KEY, String(credits));
  } catch {
    /* private mode or blocked storage */
  }
  const delta = credits - before;
  for (const fn of creditListeners) fn(delta);
  return credits;
}

/** Spend `cost` credits. False (and nothing spent) when the balance is too low. */
export function spendCredits(cost: number): boolean {
  const c = Math.floor(cost);
  if (!(c >= 0) || loadedCredits() < c) return false;
  addCredits(-c);
  return true;
}

/** Call `fn(delta)` whenever the credit total changes. */
export function onCreditsChange(fn: (delta: number) => void): void {
  creditListeners.push(fn);
}

/** Test tool: re-read the saved balance (used by the headless logic check). */
export function _reloadCreditsForTest(): void {
  credits = null;
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

/** Most reward cookies that can wait for the next level. */
export const REWARD_QUEUE_MAX = QUEUE_MAX;

/** How many of `id` are waiting in the queue. */
export function queuedCount(id: RewardCookieId): number {
  return loadQueue().filter((q) => q === id).length;
}

/** Oldest cookies drop off when the queue is already full. */
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
/** Lucky Fortune credit payouts (picked at random). */
const FORTUNE_CREDITS = [20, 30, 50, 100];

export type FortunePayout = {
  credits: number;
  booster: BoosterId | null;
  /** The slip text. */
  message: string;
  /** Short line for the payout, such as "+50 credits". */
  label: string;
};

/** Roll a Lucky Fortune: half the time credits, half a random booster. Pays it out. */
export function openFortune(): FortunePayout {
  const message = FORTUNES[Math.floor(Math.random() * FORTUNES.length)]!;
  if (Math.random() < 0.5) {
    const n = FORTUNE_CREDITS[Math.floor(Math.random() * FORTUNE_CREDITS.length)]!;
    addCredits(n);
    return { credits: n, booster: null, message, label: `+${n} credits` };
  }
  const id = BOOSTER_IDS[Math.floor(Math.random() * BOOSTER_IDS.length)]!;
  addBooster(id, 1);
  return { credits: 0, booster: id, message, label: `+1 ${BOOSTERS[id].name}` };
}

/** Take back a payout (Oven Mitt Undo of the move that earned it). */
export function revokeFortune(p: FortunePayout): void {
  if (p.credits > 0) addCredits(-p.credits);
  if (p.booster) addBooster(p.booster, -1);
}

// ---------- Daily login reward ----------

export type DailyReward = {
  credits?: number;
  boosters?: readonly BoosterId[];
  cookie?: RewardCookieId;
};

/**
 * The 7-day login calendar, day 1 first. TUNE HERE.
 *
 * Days 1-6 pay credits that climb so coming back keeps getting better
 * (20+25+30+40+50+60 = 225 credits, about three boosters in the Shop).
 * Day 7 is a fixed special prize, never credits: a Golden Cookie queued for
 * the next Challenge level PLUS an Extra Scoop. At shop prices that bundle is
 * worth 120 + 90 = 210 credits, far more than any single credit day.
 */
export const DAILY_REWARDS: readonly DailyReward[] = [
  { credits: 20 },
  { credits: 25 },
  { credits: 30 },
  { credits: 40 },
  { credits: 50 },
  { credits: 60 },
  { cookie: 'golden', boosters: ['extra-scoop'] },
];

/** Plain-text label for a day's reward, e.g. "40 credits" or "Golden Cookie + Extra Scoop". */
export function dailyLabel(r: DailyReward): string {
  const parts: string[] = [];
  if (r.credits) parts.push(`${r.credits} credits`);
  if (r.cookie) parts.push(REWARD_COOKIES[r.cookie].name);
  for (const id of r.boosters ?? []) parts.push(BOOSTERS[id].name);
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
  if (reward.credits) addCredits(reward.credits);
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
