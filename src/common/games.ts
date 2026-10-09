import type { GameSlug } from "@/games/types";

export const GAME_SLUGS: readonly GameSlug[] = ["ten-ten", "police-thief", "suwe", "sack-race", "skipping"] as const;

/** Same rule as the app: practice and pass-and-play games never rank. */
export const isRankedMode = (mode: string) => mode !== "local" && mode !== "practice";
