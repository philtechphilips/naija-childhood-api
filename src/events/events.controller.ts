import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma.service";

const Event = z.object({
  name: z.string().min(1).max(40),
  props: z.record(z.string().max(40), z.union([z.string().max(120), z.number(), z.boolean(), z.null()])).default({}),
  at: z.number().int().positive(),
});
const Batch = z.object({ events: z.array(Event).max(200) });

@Controller("events")
export class EventsController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  /**
   * Anonymous analytics batches. Sent with navigator.sendBeacon, so the body may
   * arrive as plain text. Bad batches are dropped quietly: analytics must never
   * cause the app trouble.
   */
  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async ingest(@Body() raw: unknown) {
    let body = raw;
    if (typeof raw === "string") {
      try {
        body = JSON.parse(raw);
      } catch {
        return;
      }
    }
    const parsed = Batch.safeParse(body);
    if (!parsed.success || parsed.data.events.length === 0) return;
    const now = Date.now();
    await this.db.analyticsEvent.createMany({
      data: parsed.data.events.map((e) => ({
        name: e.name,
        props: e.props as Prisma.InputJsonValue,
        // Clamp silly client clocks to the last day.
        at: new Date(Math.min(now, Math.max(now - 86_400_000, e.at))),
      })),
    });
  }
}
