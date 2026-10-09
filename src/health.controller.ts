import { Controller, Get, Inject } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "./prisma.service";

@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  @Get()
  async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { ok: true, time: new Date().toISOString() };
  }
}
