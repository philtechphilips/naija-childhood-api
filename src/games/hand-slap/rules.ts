/**
 * Backhand slap (red hands). The attacker's palms are under the defender's
 * hands. After "3, 2, 1… GO!" the attacker may strike at any moment to slap
 * the back of the defender's hands; the defender pulls away.
 *
 * - Slap lands: a point to the attacker, who goes again.
 * - Defender pulls away in time: the attacker misses and the roles swap.
 * - Defender flinches at a fake (or pulls before a real slap): a free slap.
 * - Attacker doesn't strike before the window runs out: the roles swap.
 * First to TARGET slaps wins. Pure, so the server can re-check a match log.
 */
export type Difficulty = "easy" | "normal" | "hard";

export const TARGET = 5;
/** Seconds per count beat ("3, 2, 1") before each turn. */
export const COUNT_BEAT = 0.5;
/** Seconds the attacker has to strike after GO. */
export const WINDOW = 5;
/** Your own slap: wind-up then the whip to the hands (s). */
export const YOU_SLAP = { windup: 0.08, travel: 0.17 } as const;
/** A fake: hands dip like a wind-up, then stop (s). */
export const FEINT = { dur: 0.16, cooldown: 0.35 } as const;

export const LEVELS: Record<Difficulty, {
  /** CPU slap wind-up (the "tell") and whip time: your window to pull away is the sum. */
  windup: number;
  travel: number;
  /** CPU fakes per second while attacking. */
  feintRate: number;
  /** CPU reaction when you slap (mean, spread). */
  react: number;
  reactSpread: number;
  /** Chance the CPU flinches at one of your fakes. */
  flinch: number;
}> = {
  easy: { windup: 0.17, travel: 0.19, feintRate: 0.4, react: 0.26, reactSpread: 0.06, flinch: 0.45 },
  normal: { windup: 0.15, travel: 0.19, feintRate: 0.5, react: 0.245, reactSpread: 0.05, flinch: 0.3 },
  hard: { windup: 0.14, travel: 0.18, feintRate: 0.65, react: 0.235, reactSpread: 0.04, flinch: 0.16 },
};

/**
 * Turn outcomes, from your side. The log is [code, value] pairs; value is the
 * reaction time in ms for a dodge, 0 otherwise.
 */
export const OUTCOME = {
  youSlapped: 1,
  cpuDodged: 2,
  cpuFlinched: 3,
  youTimedOut: 4,
  youGotSlapped: 5,
  youDodged: 6,
  youFlinched: 7,
} as const;
export type OutcomeCode = (typeof OUTCOME)[keyof typeof OUTCOME];

export const SCORE = { slap: 100, freeSlap: 80, dodge: 80, fastDodge: 40, win: 500 } as const;
/** A dodge faster than this (ms) earns the lightning bonus. */
export const FAST_DODGE_MS = 200;

export interface SlapSummary {
  points: [number, number];
  score: number;
  slaps: number;
  dodges: number;
  fastDodges: number;
  flinches: number;
  turns: number;
  winner: 0 | 1 | null;
}

/** Replays a log. Throws if the turns are out of order (e.g. a dodge while attacking). */
export function summarizeSlap(log: number[]): SlapSummary {
  if (log.length % 2 !== 0) throw new Error("Odd log");
  const points: [number, number] = [0, 0];
  let score = 0;
  let slaps = 0;
  let dodges = 0;
  let fastDodges = 0;
  let flinches = 0;
  let turns = 0;
  let winner: 0 | 1 | null = null;
  // Whoever attacks first is decided by the seed; the first outcome tells us.
  let attacking: boolean | null = null;
  for (let i = 0; i < log.length; i += 2) {
    if (winner !== null) throw new Error("Turns after the match ended");
    const code = log[i]!;
    const value = log[i + 1]!;
    if (!Number.isInteger(code) || !Number.isInteger(value) || value < 0) throw new Error("Bad entry");
    const mine = code >= 1 && code <= 4;
    if (code < 1 || code > 7) throw new Error("Unknown outcome");
    if (attacking === null) attacking = mine;
    if (attacking !== mine) throw new Error("Outcome out of turn");
    if (code !== OUTCOME.youDodged && value !== 0) throw new Error("Unexpected value");
    turns++;
    switch (code) {
      case OUTCOME.youSlapped:
        points[0]++;
        slaps++;
        score += SCORE.slap;
        break;
      case OUTCOME.cpuFlinched:
        points[0]++;
        slaps++;
        score += SCORE.freeSlap;
        break;
      case OUTCOME.cpuDodged:
      case OUTCOME.youTimedOut:
        attacking = false;
        break;
      case OUTCOME.youGotSlapped:
        points[1]++;
        break;
      case OUTCOME.youFlinched:
        points[1]++;
        flinches++;
        break;
      case OUTCOME.youDodged:
        if (value > 1000) throw new Error("Dodge too slow to count");
        dodges++;
        score += SCORE.dodge;
        if (value < FAST_DODGE_MS) {
          fastDodges++;
          score += SCORE.fastDodge;
        }
        attacking = true;
        break;
    }
    if (points[0] >= TARGET) winner = 0;
    else if (points[1] >= TARGET) winner = 1;
  }
  if (winner === 0) score += SCORE.win;
  return { points, score, slaps, dodges, fastDodges, flinches, turns, winner };
}

export function validateSlap(log: number[], score: number, durationSeconds: number): string | null {
  let s: SlapSummary;
  try {
    s = summarizeSlap(log);
  } catch {
    return "Unreadable match log";
  }
  if (s.winner === null) return "Match not finished";
  if (s.score !== score) return "Score does not match the match log";
  // Every turn starts with a "3, 2, 1" count.
  if (durationSeconds < s.turns * COUNT_BEAT * 3) return "Match too fast";
  return null;
}
