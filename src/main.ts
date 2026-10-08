import './style.css';
import { Game } from './game.ts';
import { renderLevelMap } from './map.ts';


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
}

function showPlay(home: HTMLElement, play: HTMLElement, game: Game): void {
  home.hidden = true;
  play.hidden = false;
  setMenuScroll(false);
  game.resize();
  requestAnimationFrame(() => game.resize());
}

async function boot(): Promise<void> {
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
    levelStars: must('#level-stars'),
    overlayStars: must('#overlay-stars'),
    overlayNext: must('#overlay-next'),
  });

  const pick = (index: number) => {
    game.startLevel(index);
    showPlay(home, play, game);
  };
  let lastMapWidth = 0;
  const drawMap = () => {
    lastMapWidth = levelMap.clientWidth;
    return renderLevelMap(levelMap, mapTotal, pick);
  };

  const openPicker = () => {
    // Show first so the map can measure its width, then center the current level.
    showPicker(home, play, menu, picker);
    const current = drawMap();
    current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  };

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
  });
  must<HTMLButtonElement>('#home-btn').addEventListener('click', () => {
    game.leaveToHome();
    showModeMenu(home, play, menu, picker);
  });
  must<HTMLButtonElement>('#overlay-levels').addEventListener('click', () => {
    game.leaveToHome();
    openPicker();
  });

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
    };
  }
}

boot();
