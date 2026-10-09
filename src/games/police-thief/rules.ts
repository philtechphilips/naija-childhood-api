/**
 * Police & Thief rules, pure so they can be unit-tested and re-run server-side.
 * - Police tag free thieves to send them to jail.
 * - A free thief touching the jail frees everyone inside.
 * - Thieves win if anyone is still free when the timer ends; police win by jailing everyone.
 */
export type Team = "police" | "thief";

export const MATCH_SECONDS = 90;
export const HEAD_START = 3;
export const CATCH_DISTANCE = 26;
export const RESCUE_IMMUNITY = 2.5;

export interface ThiefState {
  jailed: boolean;
  immuneFor: number;
}

export function canCatch(police: { x: number; y: number }, thief: { x: number; y: number } & ThiefState): boolean {
  if (thief.jailed || thief.immuneFor > 0) return false;
  return Math.hypot(police.x - thief.x, police.y - thief.y) <= CATCH_DISTANCE;
}

export function outcome(thieves: ThiefState[], timeLeft: number): Team | null {
  if (thieves.length > 0 && thieves.every((t) => t.jailed)) return "police";
  if (timeLeft <= 0) return "thief";
  return null;
}

export interface MatchStats {
  role: Team;
  won: boolean;
  /** Seconds the human thief spent free. */
  freeSeconds: number;
  rescues: number;
  catches: number;
  pickups: number;
  timeLeft: number;
}

export function scoreMatch(s: MatchStats): number {
  if (s.role === "thief") {
    return Math.round(s.freeSeconds * 10) + s.rescues * 300 + s.pickups * 25 + (s.won ? 800 : 0);
  }
  return s.catches * 250 + s.pickups * 25 + (s.won ? 800 + Math.round(s.timeLeft) * 20 : 0);
}

/** Log layout for server replay: [role, won, freeSeconds*10, rescues, catches, pickups, timeLeft*10]. */
export function encodeStats(s: MatchStats): number[] {
  return [s.role === "thief" ? 0 : 1, s.won ? 1 : 0, Math.round(s.freeSeconds * 10), s.rescues, s.catches, s.pickups, Math.round(s.timeLeft * 10)];
}
