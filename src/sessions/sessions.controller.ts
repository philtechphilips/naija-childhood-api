import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { ZodPipe } from "../common/zod";
import { GAME_SLUGS } from "../common/games";
import { AuthGuard, UserId } from "../auth/jwt.guard";
import { SessionsService, type IncomingResult } from "./sessions.service";

const Result = z.object({
  clientId: z.string().min(6).max(64),
  playedAt: z.string().datetime().optional(),
  game: z.enum(GAME_SLUGS as [string, ...string[]]),
  mode: z.string().min(1).max(24),
  options: z.record(z.string().max(32), z.string().max(32)).default({}),
  score: z.number().int().min(0).max(10_000_000),
  won: z.boolean().nullable(),
  durationMs: z.number().int().min(0).max(3 * 3600 * 1000),
  headline: z.string().max(200).default(""),
  detail: z.string().max(300).default(""),
  stats: z.record(z.string().max(32), z.number()).default({}),
  seed: z.number().int(),
  log: z.array(z.number().int()).max(5000),
});
const Batch = z.object({ results: z.array(Result).min(1).max(50) });

@Controller("sessions")
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly sessions: SessionsService) {}

  /** Batch upload (the app sends its offline queue in one go). Safe to retry. */
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async submit(@UserId() userId: string, @Body(new ZodPipe(Batch)) body: z.infer<typeof Batch>) {
    return { results: await this.sessions.submit(userId, body.results as IncomingResult[]) };
  }

  @Get()
  recent(@UserId() userId: string) {
    return this.sessions.recent(userId);
  }
}
