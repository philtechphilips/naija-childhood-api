/**
 * Ten-Ten rules, kept pure so the same code can score a match on the client
 * and re-validate it on the server from the compact log.
 *
 * Two players clap, clap, jump and throw one foot out on the beat.
 * - The LEADER scores when both feet land on the same side (a mirror match).
 * - The other player scores when the feet land on opposite sides.
 * - Throwing late, early or not at all is a foul and gives the point away.
 * - Whoever wins the throw leads the next one. First to 10 wins.
 */
export type Side = "L" | "R";
export type Player = 0 | 1;
export type Judgement = "perfect" | "good" | "ok" | "miss";

export const TARGET_POINTS = 10;

/** Timing windows in seconds either side of the throw beat. */
export const WINDOWS = { perfect: 0.07, good: 0.13, ok: 0.21 } as const;

export const SCORE = {
  perfect: 30,
  good: 15,
  ok: 5,
  miss: 0,
  pointWon: 100,
  streakStep: 20,
  streakCap: 5,
  matchWon: 500,
} as const;

export function judge(offset: number | null): Judgement {
  if (offset === null) return "miss";
  const a = Math.abs(offset);
  if (a <= WINDOWS.perfect) return "perfect";
  if (a <= WINDOWS.good) return "good";
  if (a <= WINDOWS.ok) return "ok";
  return "miss";
}

export interface Throw {
  leader: Player;
  sides: [Side | null, Side | null];
  judgements: [Judgement, Judgement];
}

const fouled = (side: Side | null, j: Judgement) => side === null || j === "miss";

/** Returns the throw winner, or null when both players fouled (throw replayed). */
export function throwWinner(t: Throw): Player | null {
  const f0 = fouled(t.sides[0], t.judgements[0]);
  const f1 = fouled(t.sides[1], t.judgements[1]);
  if (f0 && f1) return null;
  if (f0) return 1;
  if (f1) return 0;
  const match = t.sides[0] === t.sides[1];
  return match ? t.leader : t.leader === 0 ? 1 : 0;
}

export function nextLeader(current: Player, winner: Player | null): Player {
  return winner ?? current;
}

/** Beats per minute for the next bar. The rhythm speeds up gently as the match goes on. */
export function bpmFor(startBpm: number, throwsPlayed: number, rampBpm = 2, topBpm = 160): number {
  return Math.min(startBpm + throwsPlayed * rampBpm, topBpm);
}

export interface MatchSummary {
  points: [number, number];
  /** Score from player 0's point of view (leaderboard score). */
  score: number;
  perfects: number;
  goods: number;
  fouls: number;
  longestStreak: number;
  winner: Player | null;
  throws: number;
}

export function summarize(throws: Throw[], target: number = TARGET_POINTS): MatchSummary {
  const points: [number, number] = [0, 0];
  let score = 0;
  let perfects = 0;
  let goods = 0;
  let fouls = 0;
  let streak = 0;
  let longestStreak = 0;
  let winner: Player | null = null;
  let leader: Player = 0;
  let played = 0;

  for (const t of throws) {
    if (winner !== null) break;
    if (t.leader !== leader) throw new Error("Invalid log: leader out of sequence");
    played++;
    const j = t.judgements[0];
    if (t.sides[0] !== null) score += SCORE[j];
    if (j === "perfect" && t.sides[0] !== null) perfects++;
    if (j === "good" && t.sides[0] !== null) goods++;
    if (fouled(t.sides[0], j)) fouls++;

    const w = throwWinner(t);
    if (w !== null) points[w]++;
    if (w === 0) {
      streak++;
      longestStreak = Math.max(longestStreak, streak);
      score += SCORE.pointWon + Math.min(streak - 1, SCORE.streakCap) * SCORE.streakStep;
    } else if (w === 1) {
      streak = 0;
    }
    leader = nextLeader(leader, w);
    if (points[0] >= target) winner = 0;
    else if (points[1] >= target) winner = 1;
  }
  if (winner === 0) score += SCORE.matchWon;
  return { points, score, perfects, goods, fouls, longestStreak, winner, throws: played };
}

const SIDE_CODE = { L: 1, R: 2 } as const;
const JUDGE_CODE: Record<Judgement, number> = { perfect: 0, good: 1, ok: 2, miss: 3 };
const JUDGES: Judgement[] = ["perfect", "good", "ok", "miss"];

/** Packs each throw into one integer: leader | side0 | j0 | side1 | j1. */
export function encodeLog(throws: Throw[]): number[] {
  return throws.map(
    (t) =>
      t.leader * 10000 +
      (t.sides[0] ? SIDE_CODE[t.sides[0]] : 0) * 1000 +
      JUDGE_CODE[t.judgements[0]] * 100 +
      (t.sides[1] ? SIDE_CODE[t.sides[1]] : 0) * 10 +
      JUDGE_CODE[t.judgements[1]],
  );
}

export function decodeLog(log: number[]): Throw[] {
  const side = (n: number): Side | null => (n === 1 ? "L" : n === 2 ? "R" : null);
  return log.map((n) => {
    const leader = Math.floor(n / 10000) as Player;
    const j = (k: number): Judgement => JUDGES[k] ?? "miss";
    return {
      leader,
      sides: [side(Math.floor(n / 1000) % 10), side(Math.floor(n / 10) % 10)],
      judgements: [j(Math.floor(n / 100) % 10), j(n % 10)],
    };
  });
}
