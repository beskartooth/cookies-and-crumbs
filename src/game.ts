import {
  areAdjacent,
  clearMatches,
  createInitialBoard,
  findMatches,
  hasValidMove,
  inBounds,
  scoreForMatchCount,
  settleBoard,
  type SettleMove,
  swapCells,
  type MatchPlan,
} from './board.ts';
import {
  COLS,
  COOKIE_SRC,
  CRUMB_COLORS,
  JAR_SRC,
  ROWS,
  type Cell,
  type CookieId,
  type Crumb,
  type FlavorId,
  type Pos,
} from './types.ts';
import {
  LEVELS,
  PRIZE_POINTS,
  QUEST_POINTS,
  questLabel,
  questTarget,
  saveUnlocked,
  type Quest,
} from './levels.ts';

export type Hud = {
  root: HTMLElement;
  score: HTMLElement;
  best: HTMLElement;
  quests: HTMLElement;
  level: HTMLElement;
  moves: HTMLElement;
  goal: HTMLElement;
  goalSuffix: HTMLElement;
  overlay: HTMLElement;
  overlayTitle: HTMLElement;
  overlayText: HTMLElement;
  overlayButton: HTMLButtonElement;
};

export type PlayMode = 'home' | 'challenge' | 'bakeathon';

const POP_MS = 150;
const SWAP_MS = 160;
const FALL_MS = 280;
const BOUNCE_MS = 90;
const PAD = 6; // board padding in canvas units
const JAR_POINTS = 50;

type Popup = {
  x: number;
  y: number;
  text: string;
  sub?: string;
  t0: number;
  dur: number;
  size: number;
  color: string;
};

type Visual = {
  key: number;
  id: CookieId;
  /** Current drawn col/row (may be fractional during anim). */
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  /** Drawn as a jar while true. */
  jar: boolean;
  prize: boolean;
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
  | { kind: 'pop'; matches: Pos[]; t0: number; blast: boolean }
  | {
      kind: 'fall';
      t0: number;
      moves: SettleMove[];
    }
  | { kind: 'hold'; t0: number; ms: number };

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hud: Hud;
  private board: (Cell | null)[][] = [];
  private mode: PlayMode = 'home';
  private levelIndex = 0;
  private movesLeft = 0;
  private ended = true;
  private overlayAction: (() => void) | null = null;
  private images = new Map<CookieId, HTMLImageElement>();
  private jarImages = new Map<FlavorId, HTMLImageElement>();
  private visuals = new Map<number, Visual>();
  private crumbs: Crumb[] = [];
  private score = 0;
  /** Points and matches earned so far in the current move, and the round's best move. */
  private moveScore = 0;
  private moveMatches = 0;
  private bestMove = 0;
  private popups: Popup[] = [];
  /** Progress per quest index for the current level. */
  private questProgress: number[] = [];
  private questsDone = new Set<number>();
  private cascade = 0;
  /** Cherry-bomb blasts already fired during the current move. */
  private blastsThisMove = 0;
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
  }

  /** Start one chosen challenge level (0-based). Does not jump to the highest unlock. */
  startLevel(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= LEVELS.length) return;
    this.beginLevel(index);
  }

  enterBakeathon(): void {
    this.mode = 'bakeathon';
    this.movesLeft = 0;
    this.dealFresh();
    this.refreshHud();
  }

  leaveToHome(): void {
    this.mode = 'home';
    this.ended = true;
    this.selected = null;
    this.dragStart = null;
    this.dragMoved = false;
    this.overlayAction = null;
    this.phase = { kind: 'ready' };
    this.hud.overlay.hidden = true;
  }

  async load(): Promise<void> {
    const loadImg = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${src}`));
        img.src = src;
      });
    const cookies = Object.entries(COOKIE_SRC) as [CookieId, string][];
    const jars = Object.entries(JAR_SRC) as [FlavorId, string][];
    await Promise.all([
      ...cookies.map(async ([id, src]) => this.images.set(id, await loadImg(src))),
      ...jars.map(async ([id, src]) => this.jarImages.set(id, await loadImg(src))),
    ]);
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
      try {
        this.update(ts, dt);
        this.draw();
      } catch (err) {
        console.error(err);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resize(): void {
    const wrap = this.canvas.parentElement;
    const cssW = wrap ? wrap.clientWidth : Math.min(window.innerWidth - 24, 560);
    // Leave room for header/hint; board is square and nearly full width.
    const maxH = Math.max(240, window.innerHeight - 140);
    const size = Math.floor(Math.min(cssW, maxH));
    // #play is display:none on the home screen, so the wrap measures 0.
    // Ignore that instead of zeroing the canvas and killing the draw loop.
    if (size < 32) return;
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
          jar: !!cell.jar,
          prize: !!cell.prize,
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
    if (this.ended || this.mode === 'home') return;
    if (this.mode === 'challenge' && this.movesLeft <= 0) return;
    if (!areAdjacent(a, b)) return;
    const ca = this.board[a.row]![a.col];
    const cb = this.board[b.row]![b.col];
    if (!ca || !cb) return;

    // Unbroken jars are locked in place: the swap just bounces.
    const locked = !!ca.jar || !!cb.jar;
    let valid = false;
    if (!locked) {
      swapCells(this.board, a, b);
      const plan = findMatches(this.board);
      valid = plan.clear.size > 0 || plan.bombs.length > 0;
    }
    if (locked) {
      // Board untouched.
    } else if (!valid) {
      // Swap back logically after the bounce animation.
      swapCells(this.board, a, b);
    } else {
      this.blastsThisMove = 0;
      this.moveScore = 0;
      this.moveMatches = 0;
      if (this.mode === 'challenge') {
        this.movesLeft -= 1;
        this.refreshHud();
      }
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

    if (phase.kind === 'hold') {
      if (ts - phase.t0 >= phase.ms) this.beginBlast(ts);
      return;
    }

    if (phase.kind === 'pop') {
      const dur = phase.blast ? 220 : POP_MS;
      const t = Math.min(1, (ts - phase.t0) / dur);
      const punch = phase.blast ? 0.5 : 0.25;
      for (const pos of phase.matches) {
        const cell = this.board[pos.row]![pos.col];
        if (!cell) continue;
        const v = this.visuals.get(cell.key);
        if (!v) continue;
        if (cell.jar) {
          // Jar rattles; it breaks at the end of the pop instead of vanishing.
          v.x = pos.col + Math.sin(t * Math.PI * 6) * 0.06 * (1 - t);
          continue;
        }
        // Squash then shrink
        const squash = Math.sin(t * Math.PI);
        v.scaleX = 1 + squash * punch;
        v.scaleY = 1 - squash * 0.35 - t * 0.65;
        v.alpha = 1 - t;
        if (v.scaleY < 0.05) v.scaleY = 0.05;
      }

      if (t >= 1) {
        // Jars in the match break into a normal cookie that stays put.
        // Everything else bursts into crumbs and clears.
        const toClear: Pos[] = [];
        let jarsBroken = 0;
        let prizesClaimed = 0;
        for (const pos of phase.matches) {
          const cell = this.board[pos.row]![pos.col];
          if (!cell) continue;
          const px = this.gridToPixel(pos.col + 0.5, pos.row + 0.5);
          if (cell.jar) {
            cell.jar = false;
            jarsBroken += 1;
            this.bumpQuest('jars', 1, ts);
            this.spawnShards(px.x, px.y);
            continue;
          }
          const wasPrize = !!cell.prize;
          if (wasPrize) {
            prizesClaimed += 1;
            cell.prize = false;
            this.bumpQuest('prize', 1, ts);
          }
          this.spawnCrumbs(px.x, px.y, cell.id, phase.blast || wasPrize);
          this.visuals.delete(cell.key);
          toClear.push(pos);
        }
        const cleared = clearMatches(this.board, toClear);
        const blastBonus = phase.blast ? 100 : 0;
        const gained =
          (cleared > 0 ? scoreForMatchCount(cleared) + this.cascade * 20 : 0) +
          blastBonus +
          jarsBroken * JAR_POINTS +
          prizesClaimed * PRIZE_POINTS;
        this.score += gained;
        if (gained > 0) {
          this.moveScore += gained;
          this.moveMatches += 1;
          // Points float up from the middle of the cookies that were crushed.
          let sx = 0;
          let sy = 0;
          for (const pos of phase.matches) {
            sx += pos.col + 0.5;
            sy += pos.row + 0.5;
          }
          const c = this.gridToPixel(sx / phase.matches.length, sy / phase.matches.length);
          this.popups.push({
            x: c.x,
            y: c.y - this.cellSize * 0.3,
            text: `+${gained}`,
            t0: ts,
            dur: 750,
            size: this.cellSize * (phase.blast ? 0.5 : 0.4),
            color: phase.blast ? '#ffd24a' : '#fff4d6',
          });
        }
        this.cascade += 1;
        this.refreshHud();

        const moves = settleBoard(this.board);

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
              x: move ? move.fromCol : col,
              y: fromRow,
              scaleX: 1,
              scaleY: 1,
              alpha: 1,
              jar: !!cell.jar,
              prize: !!cell.prize,
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
        v.x = move.fromCol + (move.col - move.fromCol) * ease;
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
        if (next.clear.size > 0 || next.bombs.length > 0) {
          this.beginPop(ts, next);
        } else {
          this.finishChain(ts);
        }
      }
    }
  }


  private beginLevel(index: number): void {
    this.mode = 'challenge';
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    this.movesLeft = LEVELS[this.levelIndex]!.moves;
    this.dealFresh();
    this.refreshHud();
  }

  private dealFresh(): void {
    this.score = 0;
    this.cascade = 0;
    this.blastsThisMove = 0;
    this.moveScore = 0;
    this.moveMatches = 0;
    this.bestMove = 0;
    this.popups = [];
    this.questsDone.clear();
    this.questProgress = [];
    this.crumbs = [];
    this.selected = null;
    this.dragStart = null;
    this.dragMoved = false;
    this.ended = false;
    this.overlayAction = null;
    this.phase = { kind: 'ready' };
    this.hud.overlay.hidden = true;
    const level = this.mode === 'challenge' ? LEVELS[this.levelIndex] : undefined;
    this.board = createInitialBoard(level?.jars ?? [], level?.prizes ?? []);
    this.syncVisualsFromBoard();
  }

  private refreshHud(): void {
    const level = LEVELS[this.levelIndex]!;
    const bake = this.mode === 'bakeathon';
    this.hud.root.dataset.mode = bake ? 'bakeathon' : 'challenge';
    this.hud.level.textContent = String(this.levelIndex + 1);
    this.hud.moves.textContent = String(this.movesLeft);
    this.hud.score.textContent = String(this.score);
    this.hud.best.textContent = String(this.bestMove);
    this.hud.goal.textContent = String(level.goal);
    this.hud.goalSuffix.hidden = bake;
    this.renderQuests();
    const hint = document.getElementById('hint');
    if (hint) {
      const base = 'Match 3 · Four clears the line · Five plants a cherry bomb';
      hint.textContent =
        !bake && level.jars?.length ? `Break the jars! · ${base}` : base;
    }
  }

  private activeQuests(): readonly Quest[] {
    if (this.mode !== 'challenge') return [];
    return LEVELS[this.levelIndex]?.quests ?? [];
  }

  private bumpQuest(kind: Quest['kind'], by: number, ts: number): void {
    if (this.ended) return;
    this.activeQuests().forEach((q, i) => {
      if (q.kind !== kind || this.questsDone.has(i)) return;
      this.questProgress[i] = (this.questProgress[i] ?? 0) + by;
      if (this.questProgress[i]! >= questTarget(q)) this.completeQuest(i, ts);
      else this.refreshHud();
    });
  }

  private checkBestQuests(ts: number): void {
    this.activeQuests().forEach((q, i) => {
      if (q.kind === 'best' && !this.questsDone.has(i) && this.bestMove > q.over) {
        this.questProgress[i] = 1;
        this.completeQuest(i, ts);
      }
    });
  }

  /** A level quest is met: +50 and a little banner. */
  private completeQuest(i: number, ts: number): void {
    const q = this.activeQuests()[i];
    if (!q || this.ended || this.questsDone.has(i)) return;
    this.questsDone.add(i);
    this.score += QUEST_POINTS;
    this.popups.push({
      x: this.boardSize / 2,
      y: this.cellSize * 1.1,
      text: 'Quest complete!',
      sub: `${questLabel(q)} +${QUEST_POINTS}`,
      t0: ts,
      dur: 1400,
      size: this.cellSize * 0.55,
      color: '#9be37a',
    });
    this.refreshHud();
  }

  private renderQuests(): void {
    const quests = this.activeQuests();
    const list = this.hud.quests;
    list.hidden = quests.length === 0;
    list.replaceChildren(
      ...quests.map((q, i) => {
        const li = document.createElement('li');
        const done = this.questsDone.has(i);
        const target = questTarget(q);
        const have = Math.min(target, this.questProgress[i] ?? 0);
        const progress = target > 1 && !done ? ` ${have}/${target}` : '';
        li.className = done ? 'quest is-done' : 'quest';
        li.textContent = `${done ? '✓' : '○'} ${questLabel(q)}${progress} · +${QUEST_POINTS}`;
        return li;
      }),
    );
  }

  private resolveOutcome(): void {
    if (this.ended || this.mode === 'home') return;

    if (this.mode === 'challenge') {
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
            `You finished all ${LEVELS.length} levels.`,
            `Replay level ${LEVELS.length}`,
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
        return;
      }
      if (!hasValidMove(this.board)) {
        this.showOverlay(
          'No moves left',
          `Score ${this.score} / ${level.goal}.`,
          'Retry',
          () => this.beginLevel(this.levelIndex),
        );
      }
      return;
    }

    if (this.mode === 'bakeathon' && !hasValidMove(this.board)) {
      this.showOverlay(
        'No moves left',
        `Final score ${this.score}.`,
        'Bake again',
        () => this.enterBakeathon(),
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

  private beginPop(ts: number, plan?: MatchPlan): void {
    const hit = plan ?? findMatches(this.board);
    if (hit.longest === 4) this.bumpQuest('match4', 1, ts);
    if (hit.longest >= 5) this.bumpQuest('match5', 1, ts);
    if (this.blastsThisMove >= 6) {
      for (const bomb of hit.bombs) hit.clear.add(bomb);
      hit.bombs = [];
    }
    this.plantBombs(hit.bombs);
    if (hit.clear.size === 0) {
      this.finishChain(ts);
      return;
    }
    this.phase = { kind: 'pop', matches: [...hit.clear], t0: ts, blast: false };
  }

  /** Turn the center of each five into a cherry bomb without popping it. */
  private plantBombs(bombs: Pos[]): void {
    for (const pos of bombs) {
      const cell = this.board[pos.row]?.[pos.col];
      if (!cell || cell.id === 'cherry-bomb') continue;
      cell.id = 'cherry-bomb';
      const visual = this.visuals.get(cell.key);
      if (visual) visual.id = 'cherry-bomb';
    }
  }

  private bombsOnBoard(): Pos[] {
    const found: Pos[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (this.board[row]![col]?.id === 'cherry-bomb') found.push({ col, row });
      }
    }
    return found;
  }

  /** Cascades are done. If a cherry bomb is waiting, pause, then blow it up. */
  private finishChain(ts: number): void {
    if (this.bombsOnBoard().length > 0) {
      this.phase = { kind: 'hold', t0: ts, ms: 320 };
      return;
    }
    this.cascade = 0;
    this.blastsThisMove = 0;
    if (this.moveScore > 0) {
      // Whole move is done: flash its total in the middle of the board.
      const center = this.boardSize / 2;
      const n = this.moveMatches;
      this.popups.push({
        x: center,
        y: center,
        text: `+${this.moveScore}`,
        sub: n > 1 ? `${n} match streak!` : '1 match',
        t0: ts,
        dur: 1100,
        size: this.cellSize * 0.9,
        color: n >= 4 ? '#ffd24a' : '#ffffff',
      });
      if (this.moveScore > this.bestMove) this.bestMove = this.moveScore;
      this.checkBestQuests(ts);
      this.moveScore = 0;
      this.moveMatches = 0;
      this.refreshHud();
    }
    this.phase = { kind: 'ready' };
    this.resolveOutcome();
  }

  /** Cherry bomb clears itself and the eight cookies around it. */
  private beginBlast(ts: number): void {
    const bombs = this.bombsOnBoard();
    const seen = new Set<string>();
    const cells: Pos[] = [];
    const add = (col: number, row: number) => {
      if (!inBounds(col, row)) return;
      const key = `${col},${row}`;
      if (seen.has(key)) return;
      if (!this.board[row]![col]) return;
      seen.add(key);
      cells.push({ col, row });
    };
    for (const bomb of bombs) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) add(bomb.col + dc, bomb.row + dr);
      }
    }
    this.blastsThisMove += 1;
    if (cells.length === 0) {
      this.finishChain(ts);
      return;
    }
    this.phase = { kind: 'pop', matches: cells, t0: ts, blast: true };
  }

  private spawnCrumbs(x: number, y: number, id: CookieId, big = false): void {
    const colors = CRUMB_COLORS[id];
    const n = big ? 16 + Math.floor(Math.random() * 8) : 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (big ? 90 : 40) + Math.random() * (big ? 190 : 120);
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

  /** Glass bits plus a little sparkle when a jar breaks. */
  private spawnShards(x: number, y: number): void {
    const colors = ['#e8f6ff', '#bfe3f5', '#ffffff', '#9fcbe0', '#f3e2c0'];
    const n = 14 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 170;
      const life = 300 + Math.random() * 250;
      this.crumbs.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        r: 1.5 + Math.random() * 3,
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
    if (size < 32 || this.cellSize <= 0) return;
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
    // Jars last so cookies dropping out from under them stay hidden behind the glass.
    for (const v of list) if (!v.jar) this.drawCookie(v);
    for (const v of list) if (v.jar) this.drawCookie(v);

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

    this.drawPopups();
  }

  private drawPopups(): void {
    const ctx = this.ctx;
    const now = performance.now();
    this.popups = this.popups.filter((p) => now - p.t0 < p.dur);
    for (const p of this.popups) {
      const t = (now - p.t0) / p.dur;
      // Quick pop in, hold, then drift up and fade.
      const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.55 : t < 0.25 ? 1.15 - ((t - 0.15) / 0.1) * 0.15 : 1;
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const rise = p.sub ? 0 : t * this.cellSize * 0.6;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(p.x, p.y - rise);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.font = `900 ${Math.round(p.size)}px system-ui, sans-serif`;
      ctx.lineWidth = Math.max(3, p.size * 0.16);
      ctx.strokeStyle = '#3d2412';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      if (p.sub) {
        const subSize = Math.round(p.size * 0.38);
        ctx.font = `800 ${subSize}px system-ui, sans-serif`;
        ctx.lineWidth = Math.max(3, subSize * 0.2);
        ctx.strokeText(p.sub, 0, p.size * 0.72);
        ctx.fillStyle = '#ffe6a8';
        ctx.fillText(p.sub, 0, p.size * 0.72);
      }
      ctx.restore();
    }
  }

  private drawCookie(v: Visual): void {
    const img =
      v.jar && v.id !== 'cherry-bomb'
        ? this.jarImages.get(v.id)
        : this.images.get(v.id);
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
    if (v.prize && !v.jar) {
      const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 280);
      const r = w * 0.62 * pulse;
      const g = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
      g.addColorStop(0, 'rgba(255, 236, 140, 0.95)');
      g.addColorStop(0.45, 'rgba(255, 180, 60, 0.55)');
      g.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
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

