import { Controller, Get, Header, Inject, Query } from "@nestjs/common";
import { z } from "zod";
import { dailyChallenge } from "@/lib/daily";
import { ZodPipe } from "../common/zod";
import { lagosDay } from "../common/day";
import { TtlCache } from "../common/cache";
import { PrismaService } from "../prisma.service";

const Q = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

@Controller("daily")
export class DailyController {
  private readonly cache = new TtlCache(30_000);
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  /** Today's challenge (same for everyone, computed like the app does) and who's completed it. */
  @Get()
  @Header("Cache-Control", "public, max-age=30, stale-while-revalidate=120")
  async today(@Query(new ZodPipe(Q)) q: z.infer<typeof Q>) {
    const day = q.day ?? lagosDay();
    return this.cache.get(day, async () => {
      const rows = await this.db.dailyCompletion.findMany({
        where: { dayKey: day },
        orderBy: [{ score: "desc" }, { createdAt: "asc" }],
        take: 20,
        select: { score: true, createdAt: true, user: { select: { name: true, avatar: true } } },
      });
      const completed = await this.db.dailyCompletion.count({ where: { dayKey: day } });
      return {
        day,
        challenge: dailyChallenge(day),
        completed,
        top: rows.map((r, i) => ({ rank: i + 1, name: r.user.name, avatar: r.user.avatar, score: r.score })),
      };
    });
  }
}
