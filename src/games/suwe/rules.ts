/**
 * Suwe (Nigerian hopscotch) rules, kept pure for testing and server replay.
 *
 * Each turn targets the next box: throw the stone into it, hop up the board
 * skipping that box, turn at "home", hop back picking the stone up, and jump out.
 * Single boxes take one foot (HOP); side-by-side boxes take both feet (SPLIT),
 * except a pair holding the stone, where you hop into the free box.
 */
import type { Rng } from "@/games/core/rng";

export type RowShape = 1 | 2;
export type Foot = "hop" | "split";
export type HopJudgement = "perfect" | "good" | "miss";

export interface Box {
  index: number;
  row: number;
  col: number;
  cols: RowShape;
}

export interface Board {
  rows: RowShape[];
  boxes: Box[];
}

export interface Step {
  /** -1 = start line, rows.length = home. */
  row: number;
  foot: Foot;
  boxes: number[];
  pick?: boolean;
  home?: boolean;
  exit?: boolean;
}

export const CLASSIC: RowShape[] = [1, 1, 1, 2, 1, 2];
export const LIVES = 3;
export const HOP_WINDOW = { perfect: 0.075, good: 0.15 } as const;

export function makeBoard(rows: RowShape[]): Board {
  const boxes: Box[] = [];
  let index = 1;
  rows.forEach((cols, row) => {
    for (let col = 0; col < cols; col++) boxes.push({ index: index++, row, col, cols });
  });
  return { rows, boxes };
}

/** Board 0 is the classic layout; later boards get longer and less predictable. */
export function generateBoard(rng: Rng, level: number): Board {
  if (level === 0) return makeBoard(CLASSIC);
  const length = Math.min(9, 6 + Math.floor(level / 2) + Math.floor(rng() * 2));
  const rows: RowShape[] = [1];
  for (let i = 1; i < length; i++) {
    const prev = rows[i - 1];
    // Doubles are more likely after a single, so boards keep a hop/split rhythm.
    rows.push(rng() < (prev === 1 ? 0.55 : 0.3) ? 2 : 1);
  }
  return makeBoard(rows);
}

export function boxesInRow(board: Board, row: number): Box[] {
  return board.boxes.filter((b) => b.row === row);
}

export function hopPlan(board: Board, stone: number): Step[] {
  const steps: Step[] = [];
  const rowStep = (row: number, goingUp: boolean): Step | null => {
    const inRow = boxesInRow(board, row);
    const hasStone = inRow.some((b) => b.index === stone);
    if (inRow.length === 1) {
      if (!hasStone) return { row, foot: "hop", boxes: [inRow[0]!.index] };
      return goingUp ? null : { row, foot: "hop", boxes: [stone], pick: true };
    }
    if (!hasStone) return { row, foot: "split", boxes: inRow.map((b) => b.index) };
    if (goingUp) return { row, foot: "hop", boxes: inRow.filter((b) => b.index !== stone).map((b) => b.index) };
    return { row, foot: "hop", boxes: [stone], pick: true };
  };
  for (let r = 0; r < board.rows.length; r++) {
    const s = rowStep(r, true);
    if (s) steps.push(s);
  }
  steps.push({ row: board.rows.length, foot: "split", boxes: [], home: true });
  for (let r = board.rows.length - 1; r >= 0; r--) {
    const s = rowStep(r, false);
    if (s) steps.push(s);
  }
  steps.push({ row: -1, foot: "split", boxes: [], exit: true });
  return steps;
}

/** How forgiving each difficulty is. Easy waits for you: only the wrong foot is a miss. */
export type SuweDifficulty = "easy" | "normal" | "hard";

export const SUWE_LEVELS: Record<SuweDifficulty, { window: number; beat: number; sweep: number; waits: boolean }> = {
  easy: { window: 1.6, beat: 1.3, sweep: 0.6, waits: true },
  normal: { window: 1.8, beat: 1.2, sweep: 0.8, waits: false },
  hard: { window: 1, beat: 1, sweep: 1, waits: false },
};

/**
 * `scale` widens the timing windows; with `waits` (Easy) a late or early press
 * is never a miss, it just isn't Perfect.
 */
export function judgeHop(offset: number | null, pressed: Foot | null, required: Foot, scale = 1, waits = false): HopJudgement {
  if (offset === null || pressed === null || pressed !== required) return "miss";
  const a = Math.abs(offset);
  if (a <= HOP_WINDOW.perfect * scale) return "perfect";
  if (a <= HOP_WINDOW.good * scale || waits) return "good";
  return "miss";
}

/** Throw accuracy from where in the box's highlight window the tap landed (0..1). */
export function judgeThrow(correctBox: boolean, phase: number): HopJudgement {
  if (!correctBox) return "miss";
  return Math.abs(phase - 0.5) < 0.22 ? "perfect" : "good";
}

export function comboMultiplier(combo: number): number {
  return 1 + Math.min(4, Math.floor(combo / 6)) * 0.5;
}

export const POINTS = {
  hop: { perfect: 50, good: 25, miss: 0 },
  throw: { perfect: 150, good: 80, miss: 0 },
  boxCleared: 200,
  boardCleared: 1000,
  perfectBoard: 1000,
} as const;

/** Event codes for the replay log. */
export const EV = {
  throwGood: 11,
  throwPerfect: 12,
  throwMiss: 10,
  hopGood: 21,
  hopPerfect: 22,
  hopMiss: 20,
  boxCleared: 30,
  boardCleared: 40,
  perfectBoard: 41,
} as const;

export interface RunTotals {
  score: number;
  combo: number;
  bestCombo: number;
  livesLost: number;
  boxes: number;
  boards: number;
  perfectBoards: number;
  perfects: number;
}

/** Replays the event log to recompute the score exactly as the engine did. */
export function replay(log: number[]): RunTotals {
  const t: RunTotals = { score: 0, combo: 0, bestCombo: 0, livesLost: 0, boxes: 0, boards: 0, perfectBoards: 0, perfects: 0 };
  for (const e of log) {
    switch (e) {
      case EV.throwPerfect:
      case EV.throwGood: {
        const j = e === EV.throwPerfect ? "perfect" : "good";
        if (j === "perfect") t.perfects++;
        t.score += Math.round(POINTS.throw[j] * comboMultiplier(t.combo));
        break;
      }
      case EV.hopPerfect:
      case EV.hopGood: {
        const j = e === EV.hopPerfect ? "perfect" : "good";
        if (j === "perfect") t.perfects++;
        t.combo++;
        t.bestCombo = Math.max(t.bestCombo, t.combo);
        t.score += Math.round(POINTS.hop[j] * comboMultiplier(t.combo));
        break;
      }
      case EV.throwMiss:
      case EV.hopMiss:
        t.combo = 0;
        t.livesLost++;
        break;
      case EV.boxCleared:
        t.boxes++;
        t.score += POINTS.boxCleared;
        break;
      case EV.boardCleared:
        t.boards++;
        t.score += POINTS.boardCleared;
        break;
      case EV.perfectBoard:
        t.perfectBoards++;
        t.score += POINTS.perfectBoard;
        break;
      default:
        throw new Error(`Unknown Suwe event ${e}`);
    }
  }
  return t;
}
