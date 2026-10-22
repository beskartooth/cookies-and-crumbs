/**
 * The Shop: spend Credits on boosters and reward cookies, picked by the player.
 *
 * Prices live in SHOP_PRICES (one table, tune freely). They are balanced
 * against the daily login: days 1-6 pay 225 credits a week (see DAILY_REWARDS
 * in rewards.ts), so a week of logins buys about three boosters, or one
 * reward cookie and a cheap booster. Lucky Fortunes add a little on top.
 *
 * This file holds the price table, the buy rules (no overspending, stock
 * caps) and the Shop panel DOM. Everything is saved in localStorage through
 * boosters.ts and rewards.ts; there are no accounts.
 */
import { BOOSTERS, BOOSTER_ICON_SRC, BOOSTER_IDS, BOOSTER_MAX, addBooster, boosterCount, type BoosterId } from './boosters.ts';
import {
  REWARD_COOKIES,
  REWARD_QUEUE_MAX,
  getCredits,
  loadQueue,
  onCreditsChange,
  queueRewardCookie,
  queuedCount,
  spendCredits,
  type RewardCookieId,
} from './rewards.ts';

export type ShopItemId = BoosterId | RewardCookieId;

/** Credits per item. TUNE HERE. */
export const SHOP_PRICES: Record<ShopItemId, number> = {
  // Boosters (kept in your booster bar, usable in any level)
  'sprinkle-shuffle': 40,
  'oven-mitt-undo': 50,
  'spatula-swap': 60,
  'rolling-pin': 75,
  'extra-scoop': 90,
  // Reward cookies (placed on the board when your next Challenge level starts)
  fortune: 70,
  golden: 120,
  rainbow: 150,
};

/** Order the Shop lists things in: cheapest boosters first, then reward cookies. */
export const SHOP_ORDER: readonly ShopItemId[] = [
  'sprinkle-shuffle',
  'oven-mitt-undo',
  'spatula-swap',
  'rolling-pin',
  'extra-scoop',
  'fortune',
  'golden',
  'rainbow',
];

function isBooster(id: ShopItemId): id is BoosterId {
  return (BOOSTER_IDS as readonly string[]).includes(id);
}

/** How many the player has: boosters held, or reward cookies waiting in the queue. */
export function ownedCount(id: ShopItemId): number {
  return isBooster(id) ? boosterCount(id) : queuedCount(id);
}

/** Why `id` can't be bought right now, or '' when it can. */
export function buyBlock(id: ShopItemId): string {
  const price = SHOP_PRICES[id];
  if (isBooster(id)) {
    if (boosterCount(id) >= BOOSTER_MAX) return `You can hold ${BOOSTER_MAX}`;
  } else if (loadQueue().length >= REWARD_QUEUE_MAX) {
    return `Next level is full (${REWARD_QUEUE_MAX} max)`;
  }
  const short = price - getCredits();
  // (credits are checked last so the stock-cap message wins)
  if (short > 0) return `Need ${short} more`;
  return '';
}

export type BuyResult = { ok: true; owned: number } | { ok: false; reason: string };

/** Buy one. Takes the credits first, only when the item can be delivered. */
export function buyItem(id: ShopItemId): BuyResult {
  const reason = buyBlock(id);
  if (reason) return { ok: false, reason };
  if (!spendCredits(SHOP_PRICES[id])) return { ok: false, reason: 'Not enough credits' };
  if (isBooster(id)) addBooster(id, 1);
  else queueRewardCookie(id);
  return { ok: true, owned: ownedCount(id) };
}

function itemName(id: ShopItemId): string {
  return isBooster(id) ? BOOSTERS[id].name : REWARD_COOKIES[id].name;
}

function itemBlurb(id: ShopItemId): string {
  return isBooster(id) ? BOOSTERS[id].blurb : `${REWARD_COOKIES[id].blurb} Placed on your next Challenge level.`;
}

// ---------- Shop panel ----------

/** The credit coin icon (an inline SVG that uses the #i-credit symbol in index.html). */
export function creditIcon(cls = 'credit-icon'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#i-credit');
  svg.append(use);
  return svg;
}

function iconFor(id: ShopItemId): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'shop-icon';
  wrap.setAttribute('aria-hidden', 'true');
  const src = isBooster(id) ? BOOSTER_ICON_SRC[id] : REWARD_COOKIES[id].src;
  const emoji = isBooster(id) ? BOOSTERS[id].emoji : REWARD_COOKIES[id].emoji;
  const fallback = () => {
    wrap.replaceChildren();
    wrap.textContent = emoji;
  };
  if (src) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', fallback, { once: true });
    img.src = src;
    wrap.append(img);
  } else fallback();
  return wrap;
}

export type ShopHooks = {
  /** Elements to make inert while the Shop is open (the screen behind it). */
  behind: () => HTMLElement[];
  /** Played on a purchase. */
  onBought?: (id: ShopItemId) => void;
  /** Played when a tap can't buy. */
  onRefused?: () => void;
};

/** How long the "Buy?" confirm stays up after the first tap. */
const CONFIRM_MS = 2600;

/**
 * Build the Shop panel inside `#shop`. Returns open(), which shows it.
 * Buying takes two taps: the first turns the price into "Buy?", the second
 * buys. The balance chip pulses, the card pops and a "+1" floats up.
 */
export function setupShop(hooks: ShopHooks): { open: () => void } {
  const panel = document.querySelector<HTMLElement>('#shop');
  const list = document.querySelector<HTMLElement>('#shop-list');
  const close = document.querySelector<HTMLButtonElement>('#shop-close');
  const balance = document.querySelector<HTMLElement>('#shop-balance');
  if (!panel || !list || !close || !balance) throw new Error('Shop markup is missing');

  type Row = { li: HTMLElement; btn: HTMLButtonElement; owned: HTMLElement; price: HTMLElement; note: HTMLElement };
  const rows = new Map<ShopItemId, Row>();
  let armed: ShopItemId | null = null;
  let armTimer = 0;
  let opener: HTMLElement | null = null;
  let behind: HTMLElement[] = [];

  const section = (title: string) => {
    const h = document.createElement('li');
    h.className = 'shop-section';
    h.textContent = title;
    return h;
  };

  for (const id of SHOP_ORDER) {
    if (id === 'fortune') list.append(section('Reward cookies \u00b7 for your next level'));
    if (id === SHOP_ORDER[0]) list.append(section('Boosters'));
    const li = document.createElement('li');
    li.className = 'shop-item';
    li.dataset.item = id;
    const icon = iconFor(id);
    const owned = document.createElement('span');
    owned.className = 'shop-owned';
    icon.append(owned);
    const text = document.createElement('div');
    text.className = 'shop-text';
    const name = document.createElement('span');
    name.className = 'shop-name';
    name.textContent = itemName(id);
    const blurb = document.createElement('span');
    blurb.className = 'shop-blurb';
    blurb.textContent = itemBlurb(id);
    const note = document.createElement('span');
    note.className = 'shop-note';
    text.append(name, blurb, note);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shop-buy';
    const price = document.createElement('span');
    price.className = 'shop-price';
    btn.append(creditIcon(), price);
    btn.addEventListener('click', () => press(id));
    li.append(icon, text, btn);
    list.append(li);
    rows.set(id, { li, btn, owned, price, note });
  }

  const paint = () => {
    balance.textContent = String(getCredits());
    for (const [id, r] of rows) {
      const n = ownedCount(id);
      const block = buyBlock(id);
      r.owned.textContent = isBooster(id) || n > 0 ? `\u00d7${n}` : '';
      r.owned.hidden = r.owned.textContent === '';
      r.price.textContent = armed === id ? 'Buy?' : String(SHOP_PRICES[id]);
      r.btn.classList.toggle('is-confirm', armed === id);
      r.btn.classList.toggle('is-short', block !== '');
      r.btn.setAttribute('aria-disabled', String(block !== ''));
      r.btn.setAttribute(
        'aria-label',
        armed === id
          ? `Tap again to buy ${itemName(id)} for ${SHOP_PRICES[id]} credits`
          : `Buy ${itemName(id)} for ${SHOP_PRICES[id]} credits${block ? `, ${block}` : ''}`,
      );
      r.note.textContent = block;
      r.note.hidden = block === '';
    }
  };

  const disarm = () => {
    armed = null;
    window.clearTimeout(armTimer);
  };

  const pop = (li: HTMLElement, cls: string, text?: string) => {
    li.classList.remove('is-bought', 'is-refused');
    void li.offsetWidth;
    li.classList.add(cls);
    if (text) {
      const f = document.createElement('span');
      f.className = 'shop-float';
      f.textContent = text;
      li.append(f);
      window.setTimeout(() => f.remove(), 900);
    }
  };

  function press(id: ShopItemId): void {
    const r = rows.get(id)!;
    const block = buyBlock(id);
    if (block) {
      disarm();
      pop(r.li, 'is-refused');
      hooks.onRefused?.();
      paint();
      return;
    }
    if (armed !== id) {
      disarm();
      armed = id;
      armTimer = window.setTimeout(() => {
        armed = null;
        paint();
      }, CONFIRM_MS);
      paint();
      return;
    }
    disarm();
    const res = buyItem(id);
    if (res.ok) {
      pop(r.li, 'is-bought', `+1 ${isBooster(id) ? BOOSTERS[id].short : itemName(id)}`);
      document.querySelectorAll<HTMLElement>('.credit-chip').forEach((c) => {
        c.classList.remove('is-spent');
        void c.offsetWidth;
        c.classList.add('is-spent');
      });
      hooks.onBought?.(id);
    } else {
      pop(r.li, 'is-refused');
      hooks.onRefused?.();
    }
    paint();
  }

  const hide = () => {
    disarm();
    panel.hidden = true;
    for (const el of behind) el.inert = false;
    opener?.focus();
  };

  close.addEventListener('click', hide);
  panel.addEventListener('click', (e) => {
    if (e.target === panel) hide();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) hide();
  });
  onCreditsChange(() => {
    if (!panel.hidden) paint();
  });

  return {
    open() {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      disarm();
      paint();
      behind = hooks.behind();
      for (const el of behind) el.inert = true;
      panel.hidden = false;
      list.scrollTop = 0;
      close.focus();
    },
  };
}
