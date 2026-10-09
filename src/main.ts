import './style.css';
import { Game } from './game.ts';
import { audio, sfx, sfxDebug } from './audio.ts';
import { bossChapter, migrateSaves, resetProgress } from './levels.ts';
import { music } from './music.ts';
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
/** A Sound / Music switch row: shows On or Off and flips on tap. */
function bindToggle(btn: HTMLButtonElement, get: () => boolean, set: (on: boolean) => void): void {
  const paint = () => {
    const on = get();
    btn.setAttribute('aria-checked', String(on));
    btn.classList.toggle('is-on', on);
    btn.querySelector('.setting-state')!.textContent = on ? 'On' : 'Off';
  };
  btn.addEventListener('click', () => {
    set(!get());
    paint();
  });
  paint();
}

function setupSettings(home: HTMLElement, onReset: () => void): void {
  bindToggle(must('#sound-toggle'), () => sfx.enabled, (on) => sfx.setEnabled(on));
  const musicBtn = must<HTMLButtonElement>('#music-toggle');
  // Hidden until Besky's loops are listed in MUSIC_TRACKS.
  musicBtn.hidden = !music.available;
  bindToggle(musicBtn, () => music.enabled, (on) => music.setEnabled(on));

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

function showPlay(home: HTMLElement, play: HTMLElement, game: Game): void {
  home.hidden = true;
  play.hidden = false;
  setMenuScroll(false);
  game.resize();
  requestAnimationFrame(() => game.resize());
}

async function boot(): Promise<void> {
  // Upgrade old 12-level saves before anything reads progress.
  migrateSaves();
  audio.install();
  sfx.init();
  music.init();
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
  setupSettings(home, () => showModeMenu(home, play, menu, picker));

  try {
    await game.load();
  } catch (err) {
    console.error(err);
    status.textContent = 'Could not load the cookie art.';
    return;
  }
  setMenuScroll(true);
  game.start();

  if (import.meta.env.DEV) {
    // Test hook for playtests: cnc.finish(score, allQuests) ends the current level.
    (window as unknown as { cnc: object }).cnc = {
      game,
      finish: (score: number, allQuests = false) => game.debugFinish(score, allQuests),
      sfx: sfxDebug(),
    };
  }
}

boot();
