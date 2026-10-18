import './style.css';
import { Game } from './game.ts';
import { audio, sfx, sfxDebug } from './audio.ts';
import {
  BOOSTERS,
  BOOSTER_ICON_SRC,
  BOOSTER_IDS,
  SHOW_TEST_TOOLS,
  boosterCount,
  grantTestBoosters,
} from './boosters.ts';
import {
  DAILY_REWARDS,
  REWARD_COOKIES,
  advanceDailyDays,
  claimDaily,
  dailyLabel,
  dailyStatus,
  getCoins,
  onCoinsChange,
  queueRewardCookie,
  resetDaily,
  setupDailyDay7,
  type DailyReward,
  type RewardCookieId,
} from './rewards.ts';
import { bossChapter, migrateSaves, resetProgress } from './levels.ts';
import { music, musicDebug } from './music.ts';
import { seedFromLive } from './storage.ts';
import { centerOn, playReturn, renderLevelMap, type MapOptions } from './map.ts';
import type { MapFocus } from './types.ts';


function setMenuScroll(on: boolean): void {
  document.documentElement.classList.toggle('menu-scroll', on);
  if (on) window.scrollTo(0, 0);
}

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

function showModeMenu(
  home: HTMLElement,
  play: HTMLElement,
  menu: HTMLElement,
  picker: HTMLElement,
): void {
  play.hidden = true;
  home.hidden = false;
  picker.hidden = true;
  menu.hidden = false;
  setMenuScroll(true);
  music.setScene('menu');
}

function showPicker(
  home: HTMLElement,
  play: HTMLElement,
  menu: HTMLElement,
  picker: HTMLElement,
): void {
  play.hidden = true;
  home.hidden = false;
  menu.hidden = true;
  picker.hidden = false;
  setMenuScroll(true);
  music.setScene('menu');
}

let toastTimer = 0;

/** Short message at the bottom of the screen. */
function showToast(text: string): void {
  const toast = must<HTMLElement>('#toast');
  toast.textContent = text;
  toast.hidden = false;
  toast.classList.remove('is-showing');
  void toast.offsetWidth; // restart the animation
  toast.classList.add('is-showing');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('is-showing');
    toast.hidden = true;
  }, 2400);
}

/** Settings panel on the home screen: Reset progress with a confirm step. */
/** One volume row: on/off switch plus a 0-100% slider. */
type VolumeChannel = {
  getOn: () => boolean;
  setOn: (on: boolean) => void;
  getVolume: () => number;
  setVolume: (percent: number) => void;
  /** Played when the slider is released (SFX preview). */
  onRelease?: () => void;
};

function bindVolumeRow(prefix: string, switchId: string, ch: VolumeChannel): void {
  const btn = must<HTMLButtonElement>(`#${switchId}`);
  const slider = must<HTMLInputElement>(`#${prefix}-volume`);
  const out = must<HTMLOutputElement>(`#${prefix}-volume-value`);
  const row = slider.closest<HTMLElement>('.setting-row')!;
  const paint = () => {
    const on = ch.getOn();
    const v = ch.getVolume();
    btn.setAttribute('aria-checked', String(on));
    btn.classList.toggle('is-on', on);
    btn.querySelector('.setting-state')!.textContent = on ? 'On' : 'Off';
    row.classList.toggle('is-muted', !on);
    slider.value = String(v);
    slider.setAttribute('aria-valuetext', on ? `${v}%` : `${v}%, off`);
    slider.style.setProperty('--fill', `${v}%`);
    out.textContent = `${v}%`;
  };
  btn.addEventListener('click', () => {
    ch.setOn(!ch.getOn());
    paint();
  });
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    ch.setVolume(v);
    // Moving the slider up means "I want to hear this": turn the switch on.
    if (v > 0 && !ch.getOn()) ch.setOn(true);
    paint();
  });
  slider.addEventListener('change', () => ch.onRelease?.());
  paint();
}

let previewAt = 0;
/** Short SFX preview at the new level, at most every 250 ms. */
function previewSfx(): void {
  const now = performance.now();
  if (now - previewAt < 250) return;
  previewAt = now;
  sfx.play('quest-done');
}

function setupSettings(home: HTMLElement, onReset: () => void, onDailyTest: () => void): void {
  bindVolumeRow('sfx', 'sound-toggle', {
    getOn: () => sfx.enabled,
    setOn: (on) => sfx.setEnabled(on),
    getVolume: () => sfx.volume,
    setVolume: (v) => sfx.setVolume(v),
    onRelease: previewSfx,
  });
  // Shown whenever MUSIC_TRACKS lists a loop.
  must<HTMLElement>('#music-row').hidden = !music.available;
  bindVolumeRow('music', 'music-toggle', {
    getOn: () => music.enabled,
    setOn: (on) => music.setEnabled(on),
    getVolume: () => music.volume,
    setVolume: (v) => music.setVolume(v),
  });

  // Test build only: top up every booster so they can all be tried.
  const testTools = must<HTMLElement>('#test-tools');
  testTools.hidden = !SHOW_TEST_TOOLS;
  must<HTMLButtonElement>('#grant-boosters').addEventListener('click', () => {
    grantTestBoosters(5);
    showToast(`Boosters: ${BOOSTER_IDS.map((id) => boosterCount(id)).join(' / ')}`);
  });

  const queueTest = (id: RewardCookieId) => {
    queueRewardCookie(id);
    showToast(`${REWARD_COOKIES[id].name} queued for your next level`);
  };
  must<HTMLButtonElement>('#queue-golden').addEventListener('click', () => queueTest('golden'));
  must<HTMLButtonElement>('#queue-rainbow').addEventListener('click', () => queueTest('rainbow'));
  must<HTMLButtonElement>('#queue-fortune').addEventListener('click', () => queueTest('fortune'));
  // Daily test tools: change the saved day, close Settings, then show the popup if a reward is due.
  const dailyTest = (change: () => void, note: string) => () => {
    change();
    close();
    showToast(note);
    onDailyTest();
  };
  must<HTMLButtonElement>('#daily-next').addEventListener(
    'click',
    dailyTest(() => advanceDailyDays(1), 'Clock moved forward 1 day'),
  );
  must<HTMLButtonElement>('#daily-skip').addEventListener(
    'click',
    dailyTest(() => advanceDailyDays(2), 'Clock moved forward 2 days (streak breaks)'),
  );
  must<HTMLButtonElement>('#daily-day7').addEventListener(
    'click',
    dailyTest(() => {
      advanceDailyDays(1);
      setupDailyDay7();
    }, 'Streak set to day 6, next claim is day 7'),
  );
  must<HTMLButtonElement>('#daily-reset').addEventListener(
    'click',
    dailyTest(resetDaily, 'Daily reward reset'),
  );

  const openBtn = must<HTMLButtonElement>('#settings-btn');
  const panel = must<HTMLElement>('#settings');
  const main = must<HTMLElement>('#settings-main');
  const confirm = must<HTMLElement>('#settings-confirm');
  const closeBtn = must<HTMLButtonElement>('#settings-close');
  const resetBtn = must<HTMLButtonElement>('#reset-progress');
  const cancelBtn = must<HTMLButtonElement>('#reset-cancel');

  const showStep = (step: 'main' | 'confirm') => {
    main.hidden = step !== 'main';
    confirm.hidden = step !== 'confirm';
    panel.setAttribute('aria-labelledby', step === 'main' ? 'settings-title' : 'confirm-title');
    (step === 'main' ? closeBtn : cancelBtn).focus();
  };
  const open = () => {
    panel.hidden = false;
    home.inert = true;
    showStep('main');
  };
  const close = () => {
    panel.hidden = true;
    home.inert = false;
    openBtn.focus();
  };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  resetBtn.addEventListener('click', () => showStep('confirm'));
  cancelBtn.addEventListener('click', () => showStep('main'));
  must<HTMLButtonElement>('#reset-yes').addEventListener('click', () => {
    const ok = resetProgress();
    close();
    if (ok) onReset();
    showToast(ok ? 'Progress reset' : 'Could not reset: storage is blocked');
  });
  // Tap outside the card or press Escape: back out one step.
  panel.addEventListener('click', (e) => {
    if (e.target === panel) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || panel.hidden) return;
    if (!confirm.hidden) showStep('main');
    else close();
  });
}

/** An icon from art with an emoji fallback. */
function iconEl(src: string | null, emoji: string, cls: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = cls;
  wrap.setAttribute('aria-hidden', 'true');
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
  } else {
    fallback();
  }
  return wrap;
}

/** One day tile's icon and short amount, e.g. coins "25" or "Pin". */
function dailyTile(r: DailyReward): { icons: HTMLElement[]; amount: string } {
  const icons: HTMLElement[] = [];
  const amounts: string[] = [];
  if (r.coins) {
    icons.push(iconEl(null, '\u{1FA99}', 'daily-icon'));
    amounts.push(`${r.coins}`);
  }
  for (const id of r.boosters ?? []) {
    icons.push(iconEl(BOOSTER_ICON_SRC[id], BOOSTERS[id].emoji, 'daily-icon'));
    amounts.push(BOOSTERS[id].short);
  }
  if (r.cookie) {
    const def = REWARD_COOKIES[r.cookie];
    icons.push(iconEl(def.src, def.emoji, 'daily-icon'));
    amounts.push(def.name);
  }
  return { icons, amount: amounts.join(' + ') };
}

/**
 * Daily login reward: a 7-day streak calendar shown on the first open each
 * (local) day. Returns a function that shows it when a reward is due.
 */
function setupDaily(home: HTMLElement): () => void {
  const panel = must<HTMLElement>('#daily');
  const sub = must<HTMLElement>('#daily-sub');
  const days = must<HTMLElement>('#daily-days');
  const note = must<HTMLElement>('#daily-note');
  const claimBtn = must<HTMLButtonElement>('#daily-claim');
  const laterBtn = must<HTMLButtonElement>('#daily-later');
  const close = () => {
    panel.hidden = true;
    home.inert = false;
  };
  laterBtn.addEventListener('click', close);
  claimBtn.addEventListener('click', () => {
    const got = claimDaily(SHOW_TEST_TOOLS);
    close();
    if (!got) return;
    const extra = got.reward.cookie ? ' It will be on your next level.' : '';
    showToast(`Day ${got.day}: ${dailyLabel(got.reward)}.${extra}`);
  });
  return () => {
    const status = dailyStatus(SHOW_TEST_TOOLS);
    if (!status.due) return;
    sub.textContent = `Day ${status.day} of 7`;
    note.hidden = !status.reset;
    note.textContent = 'You missed a day, so the streak starts over.';
    days.replaceChildren(
      ...DAILY_REWARDS.map((r, i) => {
        const n = i + 1;
        const li = document.createElement('li');
        const state = n <= status.claimed ? 'is-claimed' : n === status.day ? 'is-today' : '';
        li.className = `daily-day${n === 7 ? ' is-final' : ''} ${state}`.trim();
        const tile = dailyTile(r);
        const head = document.createElement('span');
        head.className = 'daily-num';
        head.textContent = n <= status.claimed ? `Day ${n} \u2713` : `Day ${n}`;
        const amt = document.createElement('span');
        amt.className = 'daily-amt';
        amt.textContent = tile.amount;
        const icons = document.createElement('span');
        icons.className = 'daily-icons';
        icons.append(...tile.icons);
        li.append(head, icons, amt);
        return li;
      }),
    );
    home.inert = true;
    panel.hidden = false;
    claimBtn.focus();
  };
}

function showPlay(home: HTMLElement, play: HTMLElement, game: Game): void {
  home.hidden = true;
  play.hidden = false;
  setMenuScroll(false);
  game.resize();
  requestAnimationFrame(() => game.resize());
}

async function boot(): Promise<void> {
  // Test builds start from the live game's progress (copied, never written back).
  seedFromLive();
  // Upgrade old 12-level saves before anything reads progress.
  migrateSaves();
  audio.install();
  sfx.init();
  music.init();
  music.setScene('menu');
  // UI tap on every button (after its own handler, so turning Sound on taps).
  document.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest?.('button')) sfx.play('tap');
  });
  const home = must<HTMLElement>('#home');
  const play = must<HTMLElement>('#play');
  const menu = must<HTMLElement>('#mode-menu');
  const picker = must<HTMLElement>('#level-picker');
  const levelMap = must<HTMLElement>('#level-map');
  const mapTotal = must<HTMLElement>('#map-total');
  const status = must<HTMLElement>('#home-status');
  const canvas = must<HTMLCanvasElement>('#board');
  const game = new Game(canvas, {
    root: must('#hud'),
    score: must('#score'),
    best: must('#best'),
    quests: must('#quests'),
    level: must('#level'),
    moves: must('#moves'),
    goal: must('#goal'),
    goalSuffix: must('#goal-suffix'),
    overlay: must('#overlay'),
    overlayTitle: must('#overlay-title'),
    overlayText: must('#overlay-text'),
    overlayButton: must('#overlay-action'),
    overlaySecondary: must('#overlay-levels'),
    levelStars: must('#level-stars'),
    overlayStars: must('#overlay-stars'),
    overlayNext: must('#overlay-next'),
    boosters: must('#boosters'),
  });

  const pick = (index: number) => {
    game.startLevel(index);
    showPlay(home, play, game);
    music.setScene(bossChapter(index) ? 'boss' : 'play');
  };
  let lastMapWidth = 0;
  const drawMap = (opts?: MapOptions) => {
    lastMapWidth = levelMap.clientWidth;
    return renderLevelMap(levelMap, mapTotal, pick, opts);
  };

  /** Open the map. After a clear, glide to the next level and play any unlock. */
  const openPicker = (focus: MapFocus | null = null) => {
    // Show first so the map can measure its width.
    showPicker(home, play, menu, picker);
    if (!focus) {
      const view = drawMap();
      centerOn(view.current ?? view.soon);
      return;
    }
    const view = drawMap({
      unlocking: focus.unlocked && focus.next !== null ? focus.next : undefined,
      newStars: { index: focus.cleared, from: focus.starsFrom },
    });
    void playReturn(view, focus);
  };
  game.onMap = (focus) => openPicker(focus);

  // Node positions depend on the map width; redraw when it changes.
  window.addEventListener('resize', () => {
    if (picker.hidden || home.hidden) return;
    if (levelMap.clientWidth !== lastMapWidth) drawMap();
  });

  must<HTMLButtonElement>('#play-challenge').addEventListener('click', () => {
    openPicker();
  });
  must<HTMLButtonElement>('#picker-back').addEventListener('click', () => {
    showModeMenu(home, play, menu, picker);
  });
  must<HTMLButtonElement>('#play-bakeathon').addEventListener('click', () => {
    game.enterBakeathon();
    showPlay(home, play, game);
    music.setScene('play');
  });
  must<HTMLButtonElement>('#home-btn').addEventListener('click', () => {
    game.leaveToHome();
    showModeMenu(home, play, menu, picker);
  });
  // Coin totals on the home and map screens.
  const paintCoins = () => {
    for (const el of document.querySelectorAll('.coin-count')) el.textContent = String(getCoins());
  };
  paintCoins();
  onCoinsChange(paintCoins);
  const showDaily = setupDaily(home);
  setupSettings(home, () => showModeMenu(home, play, menu, picker), showDaily);

  try {
    await game.load();
  } catch (err) {
    console.error(err);
    status.textContent = 'Could not load the cookie art.';
    return;
  }
  setMenuScroll(true);
  game.start();
  // Art is in: fetch the menu loop now so music can start on the first tap.
  music.prefetchCurrent();
  showDaily();

  if (import.meta.env.DEV) {
    // Test hook for playtests: cnc.finish(score, allQuests) ends the current level.
    (window as unknown as { cnc: object }).cnc = {
      game,
      boosters: { grant: grantTestBoosters, count: boosterCount },
      finish: (score: number, allQuests = false) => game.debugFinish(score, allQuests),
      sfx: sfxDebug(),
      music: musicDebug(),
    };
  }
}

boot();
