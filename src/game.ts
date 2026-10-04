import {
  applyGravity,
  areAdjacent,
  clearMatches,
  createInitialBoard,
  fillEmpty,
  findMatches,
  inBounds,
  scoreForMatchCount,
  swapCells,
} from './board.ts';
import {
  COLS,
  COOKIE_SRC,
  CRUMB_COLORS,
  ROWS,
  type Cell,
  type CookieId,
  type Crumb,
  type Pos,
} from './types.ts';
import { LEVELS, loadUnlocked, saveUnlocked } from './levels.ts';

export type Hud = {
  score: HTMLElement;
  level: HTMLElement;
  moves: HTMLElement;
  goal: HTMLElement;
  overlay: HTMLElement;
  overlayTitle: HTMLElement;
  overlayText: HTMLElement;
  overlayButton: HTMLButtonElement;
};

const POP_MS = 150;
const SWAP_MS = 160;
const FALL_MS = 280;
const BOUNCE_MS = 90;
const PAD = 6; // board padding in canvas units

type Visual = {
  key: number;
  id: CookieId;
  /** Current drawn col/row (may be fractional during anim). */
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  /** Target grid for settle. */
  col: number;
  row: number;
};

type Phase =
  | { kind: 'ready' }
  | {
      kind: 'swap';
      a: Pos;
      b: Pos;
      t0: number;
      valid: boolean;
    }
  | { kind: 'pop'; matches: Pos[]; t0: number }
  | {
      kind: 'fall';
      t0: number;
      moves: { key: number; col: number; fromRow: number; toRow: number }[];
    };

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hud: Hud;
  private board: (Cell | null)[][] = [];
  private levelIndex = 0;
  private movesLeft = 0;
  private ended = false;
  private overlayAction: (() => void) | null = null;
  private images = new Map<CookieId, HTMLImageElement>();
  private visuals = new Map<number, Visual>();
  private crumbs: Crumb[] = [];
  private score = 0;
  private cascade = 0;
  private phase: Phase = { kind: 'ready' };
  private selected: Pos | null = null;
  private dragStart: Pos | null = null;
  private dragMoved = false;
  private cellSize = 100;
  private boardSize = 800;
  private running = false;
  private raf = 0;
  private lastTs = 0;

  constructor(canvas: HTMLCanvasElement, hud: Hud) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not available');
    this.ctx = ctx;
    this.hud = hud;
    this.hud.overlayButton.addEventListener('click', () => {
      const action = this.overlayAction;
      this.overlayAction = null;
      this.hud.overlay.hidden = true;
      action?.();
    });
    this.beginLevel(loadUnlocked() - 1);
  }

  async load(): Promise<void> {
    const entries = Object.entries(COOKIE_SRC) as [CookieId, string][];
    await Promise.all(
      entries.map(
        ([id, src]) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              this.images.set(id, img);
              resolve();
            };
            img.onerror = () => reject(new Error(`Failed to load ${src}`));
            img.src = src;
          }),
      ),
    );
  }

  start(): void {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.running = true;
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      if (!this.running) return;
      const dt = Math.min(32, ts - this.lastTs);
      this.lastTs = ts;
      this.update(ts, dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private resize(): void {
    const wrap = this.canvas.parentElement;
    const cssW = wrap ? wrap.clientWidth : Math.min(window.innerWidth - 24, 560);
    // Leave room for header/hint; board is square and nearly full width.
    const maxH = Math.max(240, window.innerHeight - 140);
    const size = Math.floor(Math.min(cssW, maxH));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.boardSize = size;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cellSize = (size - PAD * 2) / COLS;
  }

  private syncVisualsFromBoard(): void {
    this.visuals.clear();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cell = this.board[row]![col];
        if (!cell) continue;
        this.visuals.set(cell.key, {
          key: cell.key,
          id: cell.id,
          x: col,
          y: row,
          scaleX: 1,
          scaleY: 1,
          alpha: 1,
          col,
          row,
        });
      }
    }
  }

  private gridToPixel(col: number, row: number): { x: number; y: number } {
    return {
      x: PAD + col * this.cellSize,
      y: PAD + row * this.cellSize,
    };
  }

  private pointerToCell(clientX: number, clientY: number): Pos | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * this.boardSize;
    const y = ((clientY - rect.top) / rect.height) * this.boardSize;
    const col = Math.floor((x - PAD) / this.cellSize);
    const row = Math.floor((y - PAD) / this.cellSize);
    if (!inBounds(col, row)) return null;
    return { col, row };
  }

  private bindInput(): void {
    const onDown = (clientX: number, clientY: number) => {
      if (this.ended || this.phase.kind !== 'ready') return;
      const pos = this.pointerToCell(clientX, clientY);
      if (!pos) return;
      this.dragStart = pos;
      this.dragMoved = false;
    };

    const onMove = (clientX: number, clientY: number) => {
      if (this.ended || this.phase.kind !== 'ready' || !this.dragStart) return;
      const pos = this.pointerToCell(clientX, clientY);
      if (!pos) return;
      if (pos.col === this.dragStart.col && pos.row === this.dragStart.row) return;
      if (!areAdjacent(this.dragStart, pos)) return;
      this.dragMoved = true;
      const a = this.dragStart;
      this.dragStart = null;
      this.selected = null;
      this.trySwap(a, pos);
    };

    const onUp = (clientX: number, clientY: number) => {
      if (this.ended || this.phase.kind !== 'ready') {
        this.dragStart = null;
        return;
      }
      const pos = this.pointerToCell(clientX, clientY);
      if (this.dragMoved) {
        this.dragStart = null;
        this.dragMoved = false;
        return;
      }
      // Tap-tap selection
      if (pos && this.dragStart && pos.col === this.dragStart.col && pos.row === this.dragStart.row) {
        if (
          this.selected &&
          this.selected.col === pos.col &&
          this.selected.row === pos.row
        ) {
          this.selected = null;
        } else if (this.selected && areAdjacent(this.selected, pos)) {
          const a = this.selected;
          this.selected = null;
          this.trySwap(a, pos);
        } else {
          this.selected = pos;
        }
      }
      this.dragStart = null;
      this.dragMoved = false;
    };

    this.canvas.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        this.canvas.setPointerCapture(e.pointerId);
        onDown(e.clientX, e.clientY);
      },
      { passive: false },
    );
    this.canvas.addEventListener(
      'pointermove',
      (e) => {
        e.preventDefault();
        onMove(e.clientX, e.clientY);
      },
      { passive: false },
    );
    this.canvas.addEventListener(
      'pointerup',
      (e) => {
        e.preventDefault();
        onUp(e.clientX, e.clientY);
      },
      { passive: false },
    );
    this.canvas.addEventListener(
      'pointercancel',
      () => {
        this.dragStart = null;
        this.dragMoved = false;
      },
      { passive: true },
    );

    // Prevent page scroll/zoom while interacting with the board.
    this.canvas.addEventListener(
      'touchstart',
      (e) => e.preventDefault(),
      { passive: false },
    );
    this.canvas.addEventListener(
      'touchmove',
      (e) => e.preventDefault(),
      { passive: false },
    );
  }

  private trySwap(a: Pos, b: Pos): void {
    if (this.ended || this.movesLeft <= 0) return;
    if (!areAdjacent(a, b)) return;
    if (!this.board[a.row]![a.col] || !this.board[b.row]![b.col]) return;

    swapCells(this.board, a, b);
    const matches = findMatches(this.board);
    const valid = matches.size > 0;
    if (!valid) {
      // Swap back logically after the bounce animation.
      swapCells(this.board, a, b);
    } else {
      this.movesLeft -= 1;
      this.refreshHud();
    }

    this.phase = {
      kind: 'swap',
      a,
      b,
      t0: performance.now(),
      valid,
    };
  }

  private update(ts: number, dt: number): void {
    this.updateCrumbs(dt);

    const phase = this.phase;
    if (phase.kind === 'ready') return;

    if (phase.kind === 'swap') {
      const dur = phase.valid ? SWAP_MS : SWAP_MS * 1.15;
      const t = Math.min(1, (ts - phase.t0) / dur);
      const ease = phase.valid ? easeOutCubic(t) : bounceBack(t);

      // During valid swap board already swapped; animate from old→new.
      // During invalid, board was restored; animate out and back.
      this.lerpSwapVisual(phase.a, phase.b, ease, phase.valid);

      if (t >= 1) {
        if (phase.valid) {
          this.syncVisualsFromBoard();
          this.beginPop(ts);
        } else {
          this.syncVisualsFromBoard();
          this.phase = { kind: 'ready' };
        }
      }
      return;
    }

    if (phase.kind === 'pop') {
      const t = Math.min(1, (ts - phase.t0) / POP_MS);
      for (const pos of phase.matches) {
        const cell = this.board[pos.row]![pos.col];
        if (!cell) continue;
        const v = this.visuals.get(cell.key);
        if (!v) continue;
        // Squash then shrink
        const squash = Math.sin(t * Math.PI);
        v.scaleX = 1 + squash * 0.25;
        v.scaleY = 1 - squash * 0.35 - t * 0.65;
        v.alpha = 1 - t;
        if (v.scaleY < 0.05) v.scaleY = 0.05;
      }

      if (t >= 1) {
        // Burst crumbs at match centers, then clear.
        for (const pos of phase.matches) {
          const cell = this.board[pos.row]![pos.col];
          if (!cell) continue;
          const px = this.gridToPixel(pos.col + 0.5, pos.row + 0.5);
          this.spawnCrumbs(px.x, px.y, cell.id);
          this.visuals.delete(cell.key);
        }
        const cleared = clearMatches(this.board, phase.matches);
        this.score +=
          scoreForMatchCount(cleared) + this.cascade * 20;
        this.cascade += 1;
        this.refreshHud();

        const gravityMoves = applyGravity(this.board);
        const spawns = fillEmpty(this.board);
        const moves = [
          ...gravityMoves,
          ...spawns.map((s) => ({
            key: s.key,
            col: s.col,
            fromRow: s.fromRow,
            toRow: s.toRow,
          })),
        ];

        // Rebuild visuals for remaining + new, positioned at fromRow.
        this.visuals.clear();
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const cell = this.board[row]![col];
            if (!cell) continue;
            const move = moves.find((m) => m.key === cell.key);
            const fromRow = move ? move.fromRow : row;
            this.visuals.set(cell.key, {
              key: cell.key,
              id: cell.id,
              x: col,
              y: fromRow,
              scaleX: 1,
              scaleY: 1,
              alpha: 1,
              col,
              row,
            });
          }
        }

        this.phase = { kind: 'fall', t0: ts, moves };
      }
      return;
    }

    if (phase.kind === 'fall') {
      const total = FALL_MS + BOUNCE_MS;
      const elapsed = ts - phase.t0;
      const tFall = Math.min(1, elapsed / FALL_MS);

      for (const move of phase.moves) {
        const v = this.visuals.get(move.key);
        if (!v) continue;
        const ease = easeInQuad(tFall);
        v.y = move.fromRow + (move.toRow - move.fromRow) * ease;
        v.x = move.col;
        v.col = move.col;
        v.row = move.toRow;
      }

      if (elapsed >= FALL_MS && elapsed < total) {
        // Small bounce on landing
        const bt = (elapsed - FALL_MS) / BOUNCE_MS;
        const bounce = Math.sin(bt * Math.PI) * 0.08;
        for (const move of phase.moves) {
          const v = this.visuals.get(move.key);
          if (!v) continue;
          v.y = move.toRow - bounce;
          v.scaleY = 1 - bounce * 0.6;
          v.scaleX = 1 + bounce * 0.35;
        }
      }

      if (elapsed >= total) {
        this.syncVisualsFromBoard();
        const next = findMatches(this.board);
        if (next.size > 0) {
          this.beginPop(ts, next);
        } else {
          this.cascade = 0;
          this.phase = { kind: 'ready' };
          this.resolveOutcome();
        }
      }
    }
  }


  private beginLevel(index: number): void {
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    const level = LEVELS[this.levelIndex]!;
    this.movesLeft = level.moves;
    this.score = 0;
    this.cascade = 0;
    this.crumbs = [];
    this.selected = null;
    this.dragStart = null;
    this.dragMoved = false;
    this.ended = false;
    this.overlayAction = null;
    this.phase = { kind: 'ready' };
    this.hud.overlay.hidden = true;
    this.board = createInitialBoard();
    this.syncVisualsFromBoard();
    this.refreshHud();
  }

  private refreshHud(): void {
    const level = LEVELS[this.levelIndex]!;
    this.hud.level.textContent = String(this.levelIndex + 1);
    this.hud.moves.textContent = String(this.movesLeft);
    this.hud.score.textContent = String(this.score);
    this.hud.goal.textContent = String(level.goal);
  }

  private resolveOutcome(): void {
    if (this.ended) return;
    const level = LEVELS[this.levelIndex]!;
    if (this.score >= level.goal) {
      const next = this.levelIndex + 1;
      if (next < LEVELS.length) {
        saveUnlocked(next + 1);
        this.showOverlay(
          'Level clear',
          `Level ${this.levelIndex + 1} is done.`,
          'Next level',
          () => this.beginLevel(next),
        );
      } else {
        saveUnlocked(LEVELS.length);
        this.showOverlay(
          'Set complete',
          'You finished all four levels.',
          'Replay level 4',
          () => this.beginLevel(LEVELS.length - 1),
        );
      }
      return;
    }
    if (this.movesLeft <= 0) {
      this.showOverlay(
        'Out of moves',
        `Score ${this.score} / ${level.goal}.`,
        'Retry',
        () => this.beginLevel(this.levelIndex),
      );
    }
  }

  private showOverlay(
    title: string,
    text: string,
    label: string,
    action: () => void,
  ): void {
    this.ended = true;
    this.selected = null;
    this.hud.overlayTitle.textContent = title;
    this.hud.overlayText.textContent = text;
    this.hud.overlayButton.textContent = label;
    this.overlayAction = action;
    this.hud.overlay.hidden = false;
  }

  private lerpSwapVisual(
    a: Pos,
    b: Pos,
    t: number,
    valid: boolean,
  ): void {
    // Find visuals by current board OR by searching positions.
    // After valid swap, cells are at swapped board positions.
    // We animate them from their previous grid coords.
    let va: Visual | undefined;
    let vb: Visual | undefined;

    if (valid) {
      // Board already swapped: cell now at a came from b, and vice versa.
      const cellA = this.board[a.row]![a.col];
      const cellB = this.board[b.row]![b.col];
      va = cellA ? this.visuals.get(cellA.key) : undefined;
      vb = cellB ? this.visuals.get(cellB.key) : undefined;
      if (va) {
        va.x = b.col + (a.col - b.col) * t;
        va.y = b.row + (a.row - b.row) * t;
      }
      if (vb) {
        vb.x = a.col + (b.col - a.col) * t;
        vb.y = a.row + (b.row - a.row) * t;
      }
    } else {
      // Invalid: board restored. Animate a→b→a using triangle path via t.
      // t 0→0.5 goes a to b, 0.5→1 goes b to a.
      const cellA = this.board[a.row]![a.col];
      const cellB = this.board[b.row]![b.col];
      va = cellA ? this.visuals.get(cellA.key) : undefined;
      vb = cellB ? this.visuals.get(cellB.key) : undefined;
      const go = t < 0.5 ? t * 2 : 1 - (t - 0.5) * 2;
      if (va) {
        va.x = a.col + (b.col - a.col) * go;
        va.y = a.row + (b.row - a.row) * go;
      }
      if (vb) {
        vb.x = b.col + (a.col - b.col) * go;
        vb.y = b.row + (a.row - b.row) * go;
      }
    }
  }

  private beginPop(ts: number, matches?: Set<Pos>): void {
    const m = matches ?? findMatches(this.board);
    if (m.size === 0) {
      this.phase = { kind: 'ready' };
      return;
    }
    this.phase = { kind: 'pop', matches: [...m], t0: ts };
  }

  private spawnCrumbs(x: number, y: number, id: CookieId): void {
    const colors = CRUMB_COLORS[id];
    const n = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      const life = 280 + Math.random() * 220;
      this.crumbs.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        r: 2 + Math.random() * 3.5,
        color: colors[Math.floor(Math.random() * colors.length)]!,
        life,
        maxLife: life,
      });
    }
  }

  private updateCrumbs(dt: number): void {
    const g = 420;
    for (const c of this.crumbs) {
      c.vy += g * (dt / 1000);
      c.x += c.vx * (dt / 1000);
      c.y += c.vy * (dt / 1000);
      c.life -= dt;
    }
    this.crumbs = this.crumbs.filter((c) => c.life > 0);
  }

  private draw(): void {
    const ctx = this.ctx;
    const size = this.boardSize;
    ctx.clearRect(0, 0, size, size);

    // Soft tile checker
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const { x, y } = this.gridToPixel(col, row);
        const odd = (col + row) % 2 === 0;
        ctx.fillStyle = odd
          ? 'rgba(255, 210, 150, 0.06)'
          : 'rgba(0, 0, 0, 0.12)';
        const r = this.cellSize * 0.18;
        roundRect(ctx, x + 2, y + 2, this.cellSize - 4, this.cellSize - 4, r);
        ctx.fill();
      }
    }

    // Selection highlight
    if (this.selected && this.phase.kind === 'ready') {
      const { x, y } = this.gridToPixel(this.selected.col, this.selected.row);
      ctx.strokeStyle = 'rgba(255, 230, 160, 0.95)';
      ctx.lineWidth = 3;
      const r = this.cellSize * 0.2;
      roundRect(ctx, x + 3, y + 3, this.cellSize - 6, this.cellSize - 6, r);
      ctx.stroke();
    }

    // Cookies — draw lower rows first? Actually draw by y for overlaps during fall.
    const list = [...this.visuals.values()].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const v of list) {
      this.drawCookie(v);
    }

    // Crumbs on top
    for (const c of this.crumbs) {
      const a = Math.max(0, c.life / c.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawCookie(v: Visual): void {
    const img = this.images.get(v.id);
    if (!img) return;
    const ctx = this.ctx;
    const { x, y } = this.gridToPixel(v.x, v.y);
    const inset = this.cellSize * 0.08;
    const w = this.cellSize - inset * 2;
    const h = this.cellSize - inset * 2;
    const cx = x + this.cellSize / 2;
    const cy = y + this.cellSize / 2;

    ctx.save();
    ctx.globalAlpha = v.alpha;
    ctx.translate(cx, cy);
    ctx.scale(v.scaleX, v.scaleY);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInQuad(t: number): number {
  return t * t;
}

/** 0→1 goes out then back with a slight overshoot feel. */
function bounceBack(t: number): number {
  return t;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

