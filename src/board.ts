import {
  COLS,
  COOKIE_IDS,
  ROWS,
  type Cell,
  type CookieId,
  type JarSpot,
  type Pos,
} from './types.ts';

let nextKey = 1;

export function randomCookieId(): CookieId {
  return COOKIE_IDS[Math.floor(Math.random() * COOKIE_IDS.length)]!;
}

export function makeCell(id: CookieId = randomCookieId()): Cell {
  return { id, key: nextKey++ };
}

export function createEmptyBoard(): (Cell | null)[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => null),
  );
}

/** Fill a board with random cookies that has no opening matches. */
export function createInitialBoard(jars: readonly JarSpot[] = []): Cell[][] {
  const board: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => makeCell()),
  );

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      let tries = 0;
      do {
        board[row]![col] = makeCell();
        tries++;
      } while (wouldCreateMatch(board, col, row) && tries < 40);
    }
  }

  for (const jar of jars) {
    board[jar.row]![jar.col] = { ...makeCell(jar.flavor ?? randomCookieId()), jar: true };
  }

  // Absolute safety: if somehow still matched, reshuffle until clean.
  // Jars never get rerolled; only the loose cookies around them.
  let guard = 0;
  while (guard < 500) {
    const plan = findMatches(board);
    if (plan.clear.size === 0 && plan.bombs.length === 0) break;
    const hit = [...plan.clear, ...plan.bombs];
    for (const pos of hit) {
      if (board[pos.row]![pos.col]!.jar) continue;
      board[pos.row]![pos.col] = makeCell();
    }
    guard++;
  }

  return board;
}

function wouldCreateMatch(board: Cell[][], col: number, row: number): boolean {
  const id = board[row]![col]!.id;

  // Horizontal: check left two
  if (
    col >= 2 &&
    board[row]![col - 1]?.id === id &&
    board[row]![col - 2]?.id === id
  ) {
    return true;
  }

  // Vertical: check above two
  if (
    row >= 2 &&
    board[row - 1]![col]?.id === id &&
    board[row - 2]![col]?.id === id
  ) {
    return true;
  }

  return false;
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

export function areAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
}

export function swapCells(board: (Cell | null)[][], a: Pos, b: Pos): void {
  const tmp = board[a.row]![a.col]!;
  board[a.row]![a.col] = board[b.row]![b.col]!;
  board[b.row]![b.col] = tmp;
}

export type MatchPlan = {
  /** Cookies removed by this match, including a full line on exactly four. */
  clear: Set<Pos>;
  /**
   * Center of each run of five or more. These stay on the board and become
   * cherry bombs. Every mode uses this same plan.
   */
  bombs: Pos[];
  /** Longest straight run in this match (0 when nothing matched). */
  longest: number;
};

function isFlavor(cell: Cell | null | undefined): cell is Cell {
  return !!cell && cell.id !== 'cherry-bomb';
}

/**
 * What a match does.
 * Three in a line clears just those cookies.
 * Exactly four clears the whole row (horizontal) or column (vertical).
 * Five or more clears only the matched cookies and leaves a cherry bomb on
 * the center cookie of that run.
 * The bomb is not cleared by this match or by later line clears.
 * Every mode uses this, including cascades and any mode added later.
 */
export function findMatches(board: (Cell | null)[][]): MatchPlan {
  const matched = new Map<string, Pos>();
  const bombs: Pos[] = [];
  const bombKeys = new Set<string>();

  const markBomb = (col: number, row: number) => {
    const key = `${col},${row}`;
    if (bombKeys.has(key)) return;
    const cell = board[row]![col];
    if (!isFlavor(cell) || cell.jar) return;
    bombKeys.add(key);
    bombs.push({ col, row });
  };

  type Run = { axis: 'row' | 'col'; index: number; start: number; length: number };
  const runs: Run[] = [];

  for (let row = 0; row < ROWS; row++) {
    let col = 0;
    while (col < COLS) {
      const cell = board[row]![col];
      if (!isFlavor(cell)) {
        col++;
        continue;
      }
      let end = col + 1;
      while (end < COLS && board[row]![end]?.id === cell.id) end++;
      const length = end - col;
      if (length >= 3) runs.push({ axis: 'row', index: row, start: col, length });
      col = end;
    }
  }

  for (let col = 0; col < COLS; col++) {
    let row = 0;
    while (row < ROWS) {
      const cell = board[row]![col];
      if (!isFlavor(cell)) {
        row++;
        continue;
      }
      let end = row + 1;
      while (end < ROWS && board[end]![col]?.id === cell.id) end++;
      const length = end - row;
      if (length >= 3) runs.push({ axis: 'col', index: col, start: row, length });
      row = end;
    }
  }

  for (const run of runs) {
    if (run.length < 5) continue;
    const center = run.start + Math.floor((run.length - 1) / 2);
    if (run.axis === 'row') markBomb(center, run.index);
    else markBomb(run.index, center);
  }

  const add = (col: number, row: number) => {
    if (bombKeys.has(`${col},${row}`)) return;
    if (!isFlavor(board[row]![col])) return;
    matched.set(`${col},${row}`, { col, row });
  };

  for (const run of runs) {
    if (run.length === 4) {
      if (run.axis === 'row') {
        for (let col = 0; col < COLS; col++) add(col, run.index);
      } else {
        for (let row = 0; row < ROWS; row++) add(run.index, row);
      }
    } else {
      for (let i = 0; i < run.length; i++) {
        if (run.axis === 'row') add(run.start + i, run.index);
        else add(run.index, run.start + i);
      }
    }
  }

  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0);
  return { clear: new Set(matched.values()), bombs, longest };
}

export function clearMatches(
  board: (Cell | null)[][],
  matches: Iterable<Pos>,
): number {
  let count = 0;
  for (const { col, row } of matches) {
    if (board[row]![col]) {
      board[row]![col] = null;
      count++;
    }
  }
  return count;
}

/**
 * Apply gravity: cookies fall down into empty cells.
 * Returns list of moves {key, fromRow, toRow, col} for animation.
 */
export function applyGravity(board: (Cell | null)[][]): {
  key: number;
  col: number;
  fromRow: number;
  toRow: number;
}[] {
  const moves: { key: number; col: number; fromRow: number; toRow: number }[] =
    [];

  for (let col = 0; col < COLS; col++) {
    let writeRow = ROWS - 1;
    for (let row = ROWS - 1; row >= 0; row--) {
      const cell = board[row]![col];
      if (!cell) continue;
      // An unbroken jar is locked: it never falls and nothing falls past it.
      if (cell.jar) {
        writeRow = row - 1;
        continue;
      }
      if (row !== writeRow) {
        board[writeRow]![col] = cell;
        board[row]![col] = null;
        moves.push({ key: cell.key, col, fromRow: row, toRow: writeRow });
      }
      writeRow--;
    }
  }

  return moves;
}

/**
 * Spawn new cookies into empty top cells.
 * Returns spawn info for fall-from-above animation.
 */
export function fillEmpty(board: (Cell | null)[][]): {
  key: number;
  col: number;
  toRow: number;
  fromRow: number;
  id: CookieId;
}[] {
  const spawns: {
    key: number;
    col: number;
    toRow: number;
    fromRow: number;
    id: CookieId;
  }[] = [];

  for (let col = 0; col < COLS; col++) {
    // Each stretch of column below a jar (or the board top) refills on its own.
    // New cookies under a jar drop out from behind the jar.
    let segTop = 0;
    let lid = -1; // row of the jar above this stretch, -1 means board top
    for (let row = 0; row <= ROWS; row++) {
      const atJar = row < ROWS && !!board[row]![col]?.jar;
      if (row < ROWS && !atJar) continue;
      const empties: number[] = [];
      for (let r = segTop; r < row; r++) if (!board[r]![col]) empties.push(r);
      for (let i = 0; i < empties.length; i++) {
        const toRow = empties[i]!;
        const cell = makeCell();
        board[toRow]![col] = cell;
        const fromRow =
          lid < 0 ? -empties.length + i : Math.max(lid, lid + 1 - empties.length + i);
        spawns.push({ key: cell.key, col, toRow, fromRow, id: cell.id });
      }
      lid = row;
      segTop = row + 1;
    }
  }

  return spawns;
}

export function scoreForMatchCount(count: number): number {
  // Satisfying curve: 3→30, 4→60, 5→100, plus cascade bonuses handled by caller.
  if (count <= 0) return 0;
  if (count === 3) return 30;
  if (count === 4) return 60;
  if (count === 5) return 100;
  return 100 + (count - 5) * 40;
}

export type SettleMove = {
  key: number;
  fromCol: number;
  fromRow: number;
  col: number;
  toRow: number;
};

/**
 * Drop everything into place after a clear.
 * Cookies fall straight down; new ones come in from the top of the board.
 * A gap under a locked jar gets filled by a cookie sliding in diagonally from
 * the row above in the next column over (random side when both can feed it).
 * Repeats until the board is full or nothing else can move.
 */
export function settleBoard(board: (Cell | null)[][]): SettleMove[] {
  const origin = new Map<number, { col: number; row: number }>();
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row]![col];
      if (cell) origin.set(cell.key, { col, row });
    }
  }
  const spawned = new Array<number>(COLS).fill(0);

  for (let guard = 0; guard < 200; guard++) {
    applyGravity(board);

    // New cookies enter from the top, down to the first jar or cookie.
    for (let col = 0; col < COLS; col++) {
      let depth = 0;
      while (depth < ROWS && !board[depth]![col]) depth++;
      for (let row = depth - 1; row >= 0; row--) {
        const cell = makeCell();
        board[row]![col] = cell;
        spawned[col]! += 1;
        origin.set(cell.key, { col, row: -spawned[col]! });
      }
    }

    // Slide one cookie diagonally into the lowest gap that can't fill from above.
    let slid = false;
    for (let row = ROWS - 1; row >= 1 && !slid; row--) {
      for (let col = 0; col < COLS && !slid; col++) {
        if (board[row]![col]) continue;
        const sides = [col - 1, col + 1].filter((c) => {
          if (c < 0 || c >= COLS) return false;
          const src = board[row - 1]![c];
          return !!src && !src.jar;
        });
        if (sides.length === 0) continue;
        const from = sides[Math.floor(Math.random() * sides.length)]!;
        board[row]![col] = board[row - 1]![from]!;
        board[row - 1]![from] = null;
        slid = true;
      }
    }
    if (!slid) break;
  }

  // Last resort (no neighbor can feed a gap): drop a new cookie out from the jar.
  for (const sp of fillEmpty(board)) {
    origin.set(sp.key, { col: sp.col, row: sp.fromRow });
  }

  const moves: SettleMove[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row]![col];
      if (!cell) continue;
      const o = origin.get(cell.key)!;
      if (o.col === col && o.row === row) continue;
      moves.push({ key: cell.key, fromCol: o.col, fromRow: o.row, col, toRow: row });
    }
  }
  return moves;
}
