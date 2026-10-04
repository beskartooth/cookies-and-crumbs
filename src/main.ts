import './style.css';
import { Game } from './game.ts';

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

async function boot(): Promise<void> {
  const canvas = must<HTMLCanvasElement>('#board');
  const game = new Game(canvas, {
    score: must('#score'),
    level: must('#level'),
    moves: must('#moves'),
    goal: must('#goal'),
    overlay: must('#overlay'),
    overlayTitle: must('#overlay-title'),
    overlayText: must('#overlay-text'),
    overlayButton: must('#overlay-action'),
  });
  try {
    await game.load();
  } catch (err) {
    console.error(err);
    const hint = document.querySelector<HTMLElement>('.hint');
    if (hint) {
      hint.textContent = 'Could not load the cookie art.';
    }
    return;
  }
  game.start();
}

boot();
