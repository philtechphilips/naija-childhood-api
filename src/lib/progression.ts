import type { GameResult, GameSlug } from "@/games/types";

export const LEVEL_TITLES = [
  "Pikin",
  "Small Pikin",
  "Area Kid",
  "Break-time Boss",
  "Compound Champ",
  "Street Legend",
  "Odogwu",
] as const;

/** Total XP needed to reach a level (level 1 starts at 0). */
export function xpForLevel(level: number): number {
  return 60 * (level - 1) * level;
}

export function levelInfo(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const titleIndex = Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 3));
  return {
    level,
    title: LEVEL_TITLES[titleIndex] ?? "Pikin",
    into: xp - floor,
    span: next - floor,
    progress: (xp - floor) / (next - floor),
  };
}

export function xpForResult(result: GameResult, opts: { daily: boolean }): number {
  let xp = 20;
  if (result.won) xp += 30;
  xp += Math.min(60, Math.floor(result.score / 150));
  if (opts.daily) xp += 100;
  return xp;
}

export interface ProgressSnapshot {
  gamesPlayed: Record<string, number>;
  wins: Record<string, number>;
  totalRescues: number;
  streak: number;
}

export interface AchievementDef {
  code: string;
  name: string;
  description: string;
  game?: GameSlug;
  check: (p: ProgressSnapshot, r: GameResult) => boolean;
}

const ranked = (r: GameResult) => r.mode !== "local" && r.mode !== "practice";

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    code: "first-ten-ten-win",
    name: "First Ten-Ten Win",
    description: "Win your first Ten-Ten match against the CPU.",
    game: "ten-ten",
    check: (_p, r) => r.game === "ten-ten" && r.won === true && ranked(r),
  },
  {
    code: "street-legend",
    name: "Street Legend",
    description: "Win 10 matches across any game.",
    check: (p) => Object.values(p.wins).reduce((a, b) => a + b, 0) >= 10,
  },
  {
    code: "no-be-small",
    name: "No Be Small",
    description: "Beat a Hard Ten-Ten opponent.",
    game: "ten-ten",
    check: (_p, r) => r.game === "ten-ten" && r.won === true && r.stats.difficulty === 2 && ranked(r),
  },
  {
    code: "sharp-sharp",
    name: "Sharp Sharp",
    description: "Land 8 perfect throws in one Ten-Ten match.",
    game: "ten-ten",
    check: (_p, r) => r.game === "ten-ten" && (r.stats.perfects ?? 0) >= 8 && ranked(r),
  },
  {
    code: "jailbreak",
    name: "Jailbreak",
    description: "Free a teammate from jail in Police & Thief.",
    game: "police-thief",
    check: (_p, r) => r.game === "police-thief" && (r.stats.rescues ?? 0) >= 1,
  },
  {
    code: "long-arm",
    name: "Long Arm of the Law",
    description: "Win as Police with every thief in jail.",
    game: "police-thief",
    check: (_p, r) => r.game === "police-thief" && r.options.role === "police" && r.won === true,
  },
  {
    code: "suwe-master",
    name: "Suwe Master",
    description: "Clear a whole Suwe board without losing a life.",
    game: "suwe",
    check: (_p, r) => r.game === "suwe" && (r.stats.perfectBoards ?? 0) >= 1,
  },
  {
    code: "lagos-legend",
    name: "Lagos Legend",
    description: "Run 1,000 m in a Police & Thief street run.",
    game: "police-thief",
    check: (_p, r) => r.game === "police-thief" && r.mode === "run" && (r.stats.distance ?? 0) >= 1000,
  },
  {
    code: "sports-day-gold",
    name: "Sports Day Gold",
    description: "Win the sack race on Normal or Hard.",
    game: "sack-race",
    check: (_p, r) => r.game === "sack-race" && r.won === true && r.options.difficulty !== "easy",
  },
  {
    code: "pepper-proof",
    name: "Pepper Proof",
    description: "Do 30 jumps on the long rope.",
    game: "skipping",
    check: (_p, r) => r.game === "skipping" && (r.stats.jumps ?? 0) >= 30,
  },
  {
    code: "home-free",
    name: "Home Free!",
    description: "Sneak back to the gate in Hide & Seek without getting tagged.",
    game: "hide-seek",
    check: (_p, r) => r.game === "hide-seek" && (r.stats.homeFree ?? 0) === 1,
  },
  {
    code: "eagle-eye",
    name: "Eagle Eye",
    description: "Find all three hiders in Hide & Seek on Normal or Hard.",
    game: "hide-seek",
    check: (_p, r) => r.game === "hide-seek" && r.mode === "seek" && r.won === true && r.options.difficulty !== "easy",
  },
  {
    code: "lightning-hands",
    name: "Lightning Hands",
    description: "Pull away from a slap in under 0.2 seconds.",
    game: "hand-slap",
    check: (_p, r) => r.game === "hand-slap" && (r.stats.fastDodges ?? 0) >= 1,
  },
  {
    code: "untouchable",
    name: "Untouchable",
    description: "Win Backhand Slap without getting slapped once.",
    game: "hand-slap",
    check: (_p, r) => r.game === "hand-slap" && r.won === true && (r.stats.slapped ?? 1) === 0,
  },
  {
    code: "streak-3",
    name: "3-Day Streak",
    description: "Play three days in a row.",
    check: (p) => p.streak >= 3,
  },
  {
    code: "starter",
    name: "Naija Childhood Starter",
    description: "Play Ten-Ten, Police & Thief and Suwe.",
    check: (p) => ["ten-ten", "police-thief", "suwe"].every((g) => (p.gamesPlayed[g] ?? 0) > 0),
  },
];
