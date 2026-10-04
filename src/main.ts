import './style.css';
import { Game } from './game.ts';

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

function showHome(home: HTMLElement, play: HTMLElement): void {
  play.hidden = true;
  home.hidden = false;
}

function showPlay(home: HTMLElement, play: HTMLElement, game: Game): void {
  home.hidden = true;
  play.hidden = false;
  game.resize();
  requestAnimationFrame(() => game.resize());
}

async function boot(): Promise<void> {
  const home = must<HTMLElement>('#home');
  const play = must<HTMLElement>('#play');
  const status = must<HTMLElement>('#home-status');
  const canvas = must<HTMLCanvasElement>('#board');
  const game = new Game(canvas, {
    root: must('#hud'),
    score: must('#score'),
    level: must('#level'),
    moves: must('#moves'),
    goal: must('#goal'),
    goalSuffix: must('#goal-suffix'),
    overlay: must('#overlay'),
    overlayTitle: must('#overlay-title'),
    overlayText: must('#overlay-text'),
    overlayButton: must('#overlay-action'),
  });

  must<HTMLButtonElement>('#play-challenge').addEventListener('click', () => {
    game.enterChallenge();
    showPlay(home, play, game);
  });
  must<HTMLButtonElement>('#play-bakeathon').addEventListener('click', () => {
    game.enterBakeathon();
    showPlay(home, play, game);
  });
  must<HTMLButtonElement>('#home-btn').addEventListener('click', () => {
    game.leaveToHome();
    showHome(home, play);
  });

  try {
    await game.load();
  } catch (err) {
    console.error(err);
    status.textContent = 'Could not load the cookie art.';
    return;
  }
  game.start();
}

boot();
