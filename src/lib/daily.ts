import type { GameResult, GameSlug } from "@/games/types";
import { createRng, hashString } from "@/games/core/rng";

export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export interface DailyChallenge {
  key: string;
  game: GameSlug;
  title: string;
  description: string;
  mode: string;
  options: Record<string, string>;
  seed: number;
  target: number;
}

const ROTATION: GameSlug[] = ["ten-ten", "suwe", "police-thief", "sack-race", "skipping", "hide-seek"];

/** Today's challenge. Deterministic from the date, so everyone gets the same one. */
export function dailyChallenge(key = dayKey()): DailyChallenge {
  const seed = hashString(`naija-childhood:${key}`);
  const rng = createRng(seed);
  const [y, m, d] = key.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1) / 86_400_000);
  const game = ROTATION[dayNumber % ROTATION.length] ?? "ten-ten";

  if (game === "ten-ten") {
    const target = 4 + Math.floor(rng() * 4);
    return {
      key,
      game,
      seed,
      target,
      title: "Rhythm Queen",
      description: `Beat a Normal opponent at Ten-Ten with at least ${target} perfect throws.`,
      mode: "cpu",
      options: {
        difficulty: "normal",
        place: (["street", "school", "compound"] as const)[Math.floor(rng() * 3)] ?? "street",
        time: (["afternoon", "evening", "rainy"] as const)[Math.floor(rng() * 3)] ?? "afternoon",
      },
    };
  }
  if (game === "sack-race") {
    return {
      key,
      game,
      seed,
      target: 1,
      title: "Sports Day Gold",
      description: "Win the sack race for Blue House on Normal or Hard.",
      mode: "race",
      options: { difficulty: "normal" },
    };
  }
  if (game === "skipping") {
    const target = 20 + Math.floor(rng() * 6) * 5;
    return {
      key,
      game,
      seed,
      target,
      title: "Long Rope Legend",
      description: `Do ${target} jumps in one go on the long rope.`,
      mode: "classic",
      options: { difficulty: "easy", place: "school" },
    };
  }
  if (game === "hide-seek") {
    const seek = rng() < 0.5;
    return {
      key,
      game,
      seed,
      target: seek ? 3 : 1,
      title: seek ? "Nobody Escapes" : "Boju Boju",
      description: seek ? "Find all three hiders on Normal or Hard before time runs out." : "Stay hidden from Emeka on Normal or Hard without getting caught.",
      mode: seek ? "seek" : "hide",
      options: { difficulty: "normal", time: "afternoon" },
    };
  }
  if (game === "suwe") {
    const target = 2500 + Math.floor(rng() * 6) * 500;
    return {
      key,
      game,
      seed,
      target,
      title: "Today's Board",
      description: `Score ${target.toLocaleString()} or more on today's Suwe board.`,
      mode: "daily",
      options: {},
    };
  }
  const target = 500 + Math.floor(rng() * 8) * 100;
  return {
    key,
    game,
    seed,
    target,
    title: "Hot Pursuit",
    description: `Run ${target.toLocaleString()} m through Lagos traffic before the police catch you.`,
    mode: "run",
    options: { time: (["afternoon", "evening", "rainy"] as const)[Math.floor(rng() * 3)]! },
  };
}

export function meetsChallenge(c: DailyChallenge, r: GameResult): boolean {
  if (r.game !== c.game) return false;
  if (c.game === "ten-ten") return r.mode === "cpu" && r.won === true && (r.stats.difficulty ?? 0) >= 1 && (r.stats.perfects ?? 0) >= c.target;
  if (c.game === "suwe") return r.mode === "daily" && r.score >= c.target;
  if (c.game === "sack-race") return r.won === true && r.options.difficulty !== "easy";
  if (c.game === "skipping") return (r.stats.jumps ?? 0) >= c.target;
  if (c.game === "hide-seek") {
    if (r.mode !== c.mode || r.options.difficulty === "easy") return false;
    return c.mode === "seek" ? (r.stats.found ?? 0) >= c.target : r.won === true;
  }
  return r.mode === "run" && (r.stats.distance ?? 0) >= c.target;
}
