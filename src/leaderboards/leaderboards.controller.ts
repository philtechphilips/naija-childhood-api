import { Controller, Get, Header, Inject, NotFoundException, Param, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ZodPipe } from "../common/zod";
import { GAME_SLUGS } from "../common/games";
import { AuthGuard, UserId } from "../auth/jwt.guard";
import { LeaderboardsService } from "./leaderboards.service";

const Q = z.object({
  period: z.enum(["all", "week", "today"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const game = (slug: string) => {
  if (!(GAME_SLUGS as readonly string[]).includes(slug)) throw new NotFoundException("Unknown game");
  return slug;
};

@Controller("leaderboards")
export class LeaderboardsController {
  constructor(@Inject(LeaderboardsService) private readonly boards: LeaderboardsService) {}

  /** Public and identical for everyone, so browsers and CDNs can cache it. */
  @Get(":game")
  @Header("Cache-Control", "public, max-age=15, stale-while-revalidate=60")
  async top(@Param("game") slug: string, @Query(new ZodPipe(Q)) q: z.infer<typeof Q>) {
    return { game: game(slug), period: q.period, rows: await this.boards.top(slug, q.period, q.limit) };
  }

  /** Your own rank: private, never cached by shared caches. */
  @Get(":game/me")
  @UseGuards(AuthGuard)
  @Header("Cache-Control", "private, no-store")
  async me(@Param("game") slug: string, @Query(new ZodPipe(Q)) q: z.infer<typeof Q>, @UserId() userId: string) {
    return { game: game(slug), period: q.period, me: await this.boards.me(slug, q.period, userId) };
  }
}
