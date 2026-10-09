import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma.service";
import { TtlCache } from "../common/cache";
import { GAME_SLUGS } from "../common/games";

/** What the app can be told to change without a new release. */
export const RemoteConfigSchema = z.object({
  /** Turn games off (e.g. a bug) or badge them ("New", "Hot"). */
  games: z.record(z.string(), z.object({ enabled: z.boolean().default(true), badge: z.string().max(12).nullable().default(null) })).default({}),
  /** Game shown first in the lobby. */
  featured: z.string().nullable().default(null),
  /** One-line banner on the home screen. */
  announcement: z.object({ id: z.string(), text: z.string().max(140), href: z.string().max(200).nullable().default(null) }).nullable().default(null),
  roadmap: z.array(z.string().max(30)).max(20).default([]),
  /** Oldest app build that still works with this API. */
  minClientVersion: z.string().default("0.1.0"),
});
export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;

export const DEFAULT_CONFIG: RemoteConfig = {
  games: Object.fromEntries(GAME_SLUGS.map((g) => [g, { enabled: true, badge: g === "sack-race" || g === "skipping" ? "New" : null }])),
  featured: "police-thief",
  announcement: { id: "sports-day", text: "Sports day don land! Try the new Sack Race and Skipping Rope.", href: "/games/sack-race" },
  roadmap: ["Ayo Olopon", "Tin game", "Hide & seek", "Dodgeball", "Egg & spoon", "Freeze", "Tinko tinko", "Ludo"],
  minClientVersion: "0.1.0",
};

@Injectable()
export class RemoteConfigService {
  private readonly cache = new TtlCache(60_000);
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  /** Defaults merged with whatever is stored under the "app" key (invalid rows are ignored). */
  get(): Promise<{ config: RemoteConfig; version: string }> {
    return this.cache.get("app", async () => {
      const row = await this.db.remoteConfig.findUnique({ where: { key: "app" } });
      const parsed = row ? RemoteConfigSchema.safeParse({ ...DEFAULT_CONFIG, ...(row.value as object) }) : null;
      const config = parsed?.success ? parsed.data : DEFAULT_CONFIG;
      return { config, version: (row?.updatedAt ?? new Date(0)).toISOString() };
    });
  }

  async set(value: Partial<RemoteConfig>) {
    const config = RemoteConfigSchema.parse({ ...DEFAULT_CONFIG, ...value });
    await this.db.remoteConfig.upsert({ where: { key: "app" }, create: { key: "app", value: config }, update: { value: config } });
    this.cache.invalidate();
    return config;
  }
}
