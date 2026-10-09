import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { loadEnv } from "./env";
import { PrismaService } from "./prisma.service";
import { AuthService } from "./auth/auth.service";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/jwt.guard";
import { MeController } from "./me/me.controller";
import { SessionsService } from "./sessions/sessions.service";
import { SessionsController } from "./sessions/sessions.controller";
import { LeaderboardsService } from "./leaderboards/leaderboards.service";
import { LeaderboardsController } from "./leaderboards/leaderboards.controller";
import { DailyController } from "./daily/daily.controller";
import { RemoteConfigService } from "./remote-config/remote-config.service";
import { RemoteConfigController } from "./remote-config/remote-config.controller";
import { HealthController } from "./health.controller";
import { EventsController } from "./events/events.controller";

const env = loadEnv();

@Module({
  imports: [
    JwtModule.register({ secret: env.JWT_SECRET, signOptions: { issuer: "naija-childhood" }, verifyOptions: { issuer: "naija-childhood" } }),
    // Default: 120 requests a minute per IP. Individual routes tighten this.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
  ],
  controllers: [AuthController, MeController, SessionsController, LeaderboardsController, DailyController, RemoteConfigController, HealthController, EventsController],
  providers: [PrismaService, AuthService, AuthGuard, SessionsService, LeaderboardsService, RemoteConfigService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
