import { Body, Controller, Delete, Get, HttpCode, Inject, Patch, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ZodPipe } from "../common/zod";
import { PrismaService } from "../prisma.service";
import { AuthGuard, UserId } from "../auth/jwt.guard";
import { toPublic } from "../auth/auth.service";

const Update = z.object({ name: z.string().trim().min(2).max(18).optional(), avatar: z.number().int().min(0).max(31).optional() });

@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  /** Profile plus best scores, so a new phone can restore progress after login. */
  @Get()
  async me(@UserId() userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const bests = await this.db.best.findMany({ where: { userId }, select: { game: true, score: true } });
    const played = await this.db.session.groupBy({ by: ["game"], where: { userId }, _count: { _all: true } });
    const dailies = await this.db.dailyCompletion.findMany({ where: { userId }, orderBy: { dayKey: "desc" }, take: 60, select: { dayKey: true, game: true, score: true } });
    return {
      user: toPublic(user),
      bests: Object.fromEntries(bests.map((b) => [b.game, b.score])),
      gamesPlayed: Object.fromEntries(played.map((p) => [p.game, p._count._all])),
      dailies,
    };
  }

  @Patch()
  async update(@UserId() userId: string, @Body(new ZodPipe(Update)) body: z.infer<typeof Update>) {
    return toPublic(await this.db.user.update({ where: { id: userId }, data: body }));
  }

  /** Deletes the account and everything stored for it. */
  @Delete()
  @HttpCode(204)
  async remove(@UserId() userId: string) {
    await this.db.user.delete({ where: { id: userId } });
  }
}
