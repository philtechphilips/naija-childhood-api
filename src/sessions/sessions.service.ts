import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { GameResult } from "@/games/types";
import { validateResult } from "@/lib/validation";
import { dailyChallenge, meetsChallenge } from "@/lib/daily";
import { xpForResult } from "@/lib/progression";
import { PrismaService } from "../prisma.service";
import { lagosDay } from "../common/day";
import { isRankedMode } from "../common/games";
import { LeaderboardsService } from "../leaderboards/leaderboards.service";

export type IncomingResult = GameResult & { clientId: string; playedAt?: string };

export interface SubmitOutcome {
  clientId: string;
  status: "accepted" | "duplicate" | "rejected";
  ranked: boolean;
  reason?: string;
  best?: number;
  daily?: boolean;
}

@Injectable()
export class SessionsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LeaderboardsService) private readonly boards: LeaderboardsService,
  ) {}

  /**
   * Stores a batch of finished games for a user. Each result is validated with the
   * exact rules the app uses; tampered scores are rejected and never ranked.
   */
  async submit(userId: string, results: IncomingResult[]): Promise<SubmitOutcome[]> {
    const out: SubmitOutcome[] = [];
    const touched = new Set<string>();
    for (const r of results) {
      const existing = await this.db.session.findUnique({ where: { userId_clientId: { userId, clientId: r.clientId } }, select: { id: true } });
      if (existing) {
        out.push({ clientId: r.clientId, status: "duplicate", ranked: false });
        continue;
      }
      const check = validateResult(r);
      if (!check.ok) {
        out.push({ clientId: r.clientId, status: "rejected", ranked: false, reason: check.reason });
        continue;
      }
      // Trust the phone's timestamp only within the last two days (offline play), else use now.
      const played = r.playedAt ? new Date(r.playedAt) : new Date();
      const at = Number.isFinite(played.getTime()) && Date.now() - played.getTime() < 2 * 86_400_000 && played.getTime() <= Date.now() + 60_000 ? played : new Date();
      const dayKey = lagosDay(at);
      const ranked = isRankedMode(r.mode);
      const challenge = dailyChallenge(dayKey);
      const daily = meetsChallenge(challenge, r);

      const outcome = await this.db.$transaction(async (tx) => {
        const session = await tx.session.create({
          data: {
            clientId: r.clientId,
            userId,
            game: r.game,
            mode: r.mode,
            score: r.score,
            ranked,
            durationMs: r.durationMs,
            stats: r.stats as Prisma.InputJsonValue,
            options: r.options as Prisma.InputJsonValue,
            log: r.log,
            dayKey,
            createdAt: at,
          },
        });
        let best: number | undefined;
        if (ranked) {
          const prev = await tx.best.findUnique({ where: { userId_game: { userId, game: r.game } } });
          if (!prev || r.score > prev.score) {
            await tx.best.upsert({
              where: { userId_game: { userId, game: r.game } },
              create: { userId, game: r.game, score: r.score, sessionId: session.id },
              update: { score: r.score, sessionId: session.id },
            });
            best = r.score;
          } else best = prev.score;
        }
        let firstDaily = false;
        if (daily) {
          const prevDaily = await tx.dailyCompletion.findUnique({ where: { userId_dayKey: { userId, dayKey } } });
          firstDaily = !prevDaily;
          if (!prevDaily || r.score > prevDaily.score) {
            await tx.dailyCompletion.upsert({
              where: { userId_dayKey: { userId, dayKey } },
              create: { userId, dayKey, game: r.game, score: r.score },
              update: { score: r.score },
            });
          }
        }
        await tx.user.update({ where: { id: userId }, data: { xp: { increment: xpForResult(r, { daily: firstDaily }) } } });
        return { best, daily };
      });
      if (ranked) touched.add(r.game);
      out.push({ clientId: r.clientId, status: "accepted", ranked, best: outcome.best, daily: outcome.daily });
    }
    for (const g of touched) this.boards.invalidate(g);
    return out;
  }

  recent(userId: string, take = 30) {
    return this.db.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      select: { clientId: true, game: true, mode: true, score: true, ranked: true, durationMs: true, stats: true, createdAt: true },
    });
  }
}
