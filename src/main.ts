import './style.css';
import { Game } from './game.ts';
import { LEVELS, loadUnlocked } from './levels.ts';


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

function renderLevelPicker(list: HTMLElement, onPick: (index: number) => void): void {
  const unlocked = loadUnlocked();
  list.replaceChildren();
  LEVELS.forEach((level, index) => {
    const number = index + 1;
    const locked = number > unlocked;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = locked ? 'level-btn is-locked' : 'level-btn';
    button.disabled = locked;

    const name = document.createElement('span');
    name.className = 'mode-name';
    name.textContent = `Level ${number}`;

    const desc = document.createElement('span');
    desc.className = 'mode-desc';
    desc.textContent = locked
      ? 'Locked'
      : `${level.moves} moves · ${level.goal} points`;

    button.append(name, desc);
    if (!locked) {
      button.addEventListener('click', () => onPick(index));
    }
    list.append(button);
  });
}

async function boot(): Promise<void> {
  const home = must<HTMLElement>('#home');
  const play = must<HTMLElement>('#play');
  const menu = must<HTMLElement>('#mode-menu');
  const picker = must<HTMLElement>('#level-picker');
  const list = must<HTMLElement>('#level-list');
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
  });

  const openPicker = () => {
    renderLevelPicker(list, (index) => {
      game.startLevel(index);
      showPlay(home, play, game);
    });
    showPicker(home, play, menu, picker);
  };

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
}

boot();
