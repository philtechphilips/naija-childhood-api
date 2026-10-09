import type { GameResult } from "@/games/types";
import { decodeLog, summarize } from "@/games/ten-ten/rules";
import { replay as replaySuwe } from "@/games/suwe/rules";
import { MATCH_SECONDS, scoreMatch } from "@/games/police-thief/rules";
import { validateRun } from "@/games/police-thief/run-rules";
import { validateRace } from "@/games/sack-race/rules";
import { validateSkipping } from "@/games/skipping/rules";

/**
 * Plausibility checks applied before a score is accepted onto a leaderboard.
 * The same function is meant to run server-side; the client copy keeps
 * obviously tampered results out of local boards too.
 */
export function validateResult(r: GameResult): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(r.score) || r.score < 0 || !Number.isInteger(r.score)) return { ok: false, reason: "Invalid score" };
  if (!Number.isFinite(r.durationMs) || r.durationMs < 0) return { ok: false, reason: "Invalid duration" };
  const seconds = r.durationMs / 1000;

  switch (r.game) {
    case "ten-ten": {
      if (r.mode === "local") return r.score === 0 ? { ok: true } : { ok: false, reason: "Unranked mode" };
      try {
        const target = r.mode === "practice" ? 5 : 10;
        const sum = summarize(decodeLog(r.log), target);
        if (sum.score !== r.score) return { ok: false, reason: "Score does not match the match log" };
        if (sum.winner === null) return { ok: false, reason: "Match not finished" };
        // Each throw takes at least a bar at the top tempo (4 beats at 172 bpm ≈ 1.4s).
        if (seconds < sum.throws * 1.2) return { ok: false, reason: "Match too fast" };
      } catch {
        return { ok: false, reason: "Unreadable match log" };
      }
      return { ok: true };
    }
    case "police-thief": {
      if (r.mode === "run") {
        const reason = validateRun(r.log, r.score, seconds);
        return reason ? { ok: false, reason } : { ok: true };
      }
      if (seconds > MATCH_SECONDS + 10) return { ok: false, reason: "Match too long" };
      const [role, won, free10, rescues, catches, pickups, left10] = r.log;
      if (r.log.length !== 7) return { ok: false, reason: "Unreadable match log" };
      const stats = {
        role: role === 0 ? ("thief" as const) : ("police" as const),
        won: won === 1,
        freeSeconds: (free10 ?? 0) / 10,
        rescues: rescues ?? 0,
        catches: catches ?? 0,
        pickups: pickups ?? 0,
        timeLeft: (left10 ?? 0) / 10,
      };
      if (stats.freeSeconds > seconds + 1) return { ok: false, reason: "Free time longer than the match" };
      if (stats.pickups > seconds / 8 + 2) return { ok: false, reason: "Too many pickups" };
      if (Math.abs(scoreMatch(stats) - r.score) > 1) return { ok: false, reason: "Score does not match the match log" };
      return { ok: true };
    }
    case "suwe": {
      try {
        const t = replaySuwe(r.log);
        if (t.score !== r.score) return { ok: false, reason: "Score does not match the run log" };
        // Every landing takes at least ~0.3s at the fastest tempo.
        const landings = r.log.filter((e) => e >= 10 && e < 30).length;
        if (seconds < landings * 0.3) return { ok: false, reason: "Run too fast" };
      } catch {
        return { ok: false, reason: "Unreadable run log" };
      }
      return { ok: true };
    }
    case "sack-race": {
      const reason = validateRace(r.log, r.score, seconds);
      return reason ? { ok: false, reason } : { ok: true };
    }
    case "skipping": {
      const reason = validateSkipping(r.log, r.score, seconds);
      return reason ? { ok: false, reason } : { ok: true };
    }
    default:
      return { ok: false, reason: "Unknown game" };
  }
}
