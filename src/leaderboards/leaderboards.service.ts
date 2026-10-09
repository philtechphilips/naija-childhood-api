import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { TtlCache } from "../common/cache";
import { lagosDay, lagosWeekStart } from "../common/day";

export type Period = "all" | "week" | "today";

export interface BoardRow {
  rank: number;
  userId: string;
  name: string;
  avatar: number;
  score: number;
}

/**
 * Leaderboards. All-time reads the per-player Best table (one indexed scan);
 * week/today aggregate ranked sessions in the window. Top lists are cached
 * for a few seconds and dropped as soon as a new ranked score lands.
 */
@Injectable()
export class LeaderboardsService {
  private readonly cache = new TtlCache(20_000);
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  invalidate(game: string) {
    this.cache.invalidate(`${game}:`);
  }

  top(game: string, period: Period, limit: number): Promise<BoardRow[]> {
    return this.cache.get(`${game}:${period}:${limit}`, async () => {
      if (period === "all") {
        const rows = await this.db.best.findMany({
          where: { game },
          orderBy: [{ score: "desc" }, { updatedAt: "asc" }],
          take: limit,
          select: { score: true, user: { select: { id: true, name: true, avatar: true } } },
        });
        return rows.map((r, i) => ({ rank: i + 1, userId: r.user.id, name: r.user.name, avatar: r.user.avatar, score: r.score }));
      }
      const rows = await this.db.$queryRaw<{ userId: string; name: string; avatar: number; score: number }[]>`
        SELECT s."userId", u.name, u.avatar, MAX(s.score)::int AS score
        FROM "Session" s JOIN "User" u ON u.id = s."userId"
        WHERE s.game = ${game} AND s.ranked AND ${this.window(period)}
        GROUP BY s."userId", u.name, u.avatar
        ORDER BY score DESC, MIN(s."createdAt") ASC
        LIMIT ${limit}`;
      return rows.map((r, i) => ({ rank: i + 1, ...r }));
    });
  }

  /** The caller's own best in the period and where it ranks. */
  async me(game: string, period: Period, userId: string): Promise<{ rank: number; score: number } | null> {
    if (period === "all") {
      const mine = await this.db.best.findUnique({ where: { userId_game: { userId, game } } });
      if (!mine) return null;
      const better = await this.db.best.count({ where: { game, score: { gt: mine.score } } });
      return { rank: better + 1, score: mine.score };
    }
    const [mine] = await this.db.$queryRaw<{ score: number | null }[]>`
      SELECT MAX(score)::int AS score FROM "Session" s
      WHERE s."userId" = ${userId} AND s.game = ${game} AND s.ranked AND ${this.window(period)}`;
    if (mine?.score == null) return null;
    const [row] = await this.db.$queryRaw<{ better: bigint }[]>`
      SELECT COUNT(*) AS better FROM (
        SELECT s."userId" FROM "Session" s
        WHERE s.game = ${game} AND s.ranked AND ${this.window(period)}
        GROUP BY s."userId" HAVING MAX(s.score) > ${mine.score}
      ) t`;
    return { rank: Number(row?.better ?? 0) + 1, score: mine.score };
  }

  private window(period: Period) {
    return period === "today" ? Prisma.sql`s."dayKey" = ${lagosDay()}` : Prisma.sql`s."createdAt" >= ${lagosWeekStart()}`;
  }
}
