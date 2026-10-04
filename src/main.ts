import './style.css';
import { Game } from './game.ts';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#board');
  const scoreEl = document.querySelector<HTMLElement>('#score');
  if (!canvas || !scoreEl) {
    throw new Error('Missing #board or #score');
  }

  const game = new Game(canvas, scoreEl);
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
