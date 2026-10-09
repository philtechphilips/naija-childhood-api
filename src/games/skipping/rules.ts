/**
 * Skipping rope (long rope, two turners). Pure rules shared by the renderers
 * and server-side validation.
 *
 * The rope swings round; each time it passes under your feet you must be in
 * the air. Press JUMP so the pass comes near the top of your jump. Every so
 * often the turners shout "PEPPER!" and turn it fast for a few rounds.
 */
export type Difficulty = "easy" | "normal" | "hard";

export const LIVES = 3;
/** Seconds you're off the ground per jump. */
export const AIR = 0.4;

export const LEVELS: Record<Difficulty, { start: number; min: number; pepper: number; window: number }> = {
  /** start/min = seconds per rope turn; pepper = turn time during PEPPER; window scales the clear zone. */
  easy: { start: 1.35, min: 0.8, pepper: 0.62, window: 1.35 },
  normal: { start: 1.15, min: 0.62, pepper: 0.5, window: 1.1 },
  hard: { start: 1.0, min: 0.5, pepper: 0.42, window: 1 },
};

export const PEPPER_EVERY = 15;
export const PEPPER_TURNS = 6;

/**
 * How a pass went. `offset` = rope pass time minus the top of your jump (s);
 * `airborne` = whether you were in the air at all when it passed.
 */
export type PassJudgement = "perfect" | "good" | "trip";

export function judgePass(offset: number | null, scale: number): PassJudgement {
  if (offset === null) return "trip";
  const a = Math.abs(offset);
  if (a <= 0.055 * scale) return "perfect";
  // You clear the rope anywhere in the middle of your jump (feet above the rope).
  if (a <= (AIR / 2 - 0.045) * scale) return "good";
  return "trip";
}

/** Turn time for the n-th pass (0-based), outside pepper rounds. */
export function turnTime(level: Difficulty, jumps: number): number {
  const L = LEVELS[level];
  return Math.max(L.min, L.start - jumps * 0.014);
}

// ------------------------------------------------------------------ scoring / replay

export const EV = { perfect: 1, good: 2, trip: 3, pepperPerfect: 4, pepperGood: 5, pepperTrip: 6 } as const;

export function comboMultiplier(combo: number): number {
  return 1 + Math.min(4, Math.floor(combo / 10)) * 0.5;
}

export interface Totals {
  score: number;
  jumps: number;
  perfects: number;
  combo: number;
  bestCombo: number;
  trips: number;
  peppers: number;
}

/** Recomputes the score from the pass log exactly as the game does. */
export function replay(log: number[]): Totals {
  const t: Totals = { score: 0, jumps: 0, perfects: 0, combo: 0, bestCombo: 0, trips: 0, peppers: 0 };
  for (const e of log) {
    const pepper = e >= 4;
    const kind = pepper ? e - 3 : e;
    if (kind === EV.trip) {
      t.trips++;
      t.combo = 0;
      if (t.trips > LIVES) throw new Error("Too many trips");
      continue;
    }
    if (kind !== EV.perfect && kind !== EV.good) throw new Error(`Unknown event ${e}`);
    t.jumps++;
    t.combo++;
    t.bestCombo = Math.max(t.bestCombo, t.combo);
    if (pepper) t.peppers++;
    if (kind === EV.perfect) t.perfects++;
    t.score += Math.round((kind === EV.perfect ? 15 : 10) * comboMultiplier(t.combo) * (pepper ? 2 : 1));
  }
  return t;
}

export function validateSkipping(log: number[], score: number, durationSeconds: number): string | null {
  try {
    const t = replay(log);
    if (t.score !== score) return "Score does not match the jump log";
    // The fastest the rope ever turns is a pepper round on Hard.
    if (durationSeconds < (t.jumps + t.trips) * LEVELS.hard.pepper * 0.95) return "Jumped faster than the rope turns";
    return null;
  } catch {
    return "Unreadable jump log";
  }
}
