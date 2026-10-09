import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { ZodPipe } from "../common/zod";
import { AuthService } from "./auth.service";

const Register = z.object({
  email: z.string().email().max(160),
  password: z.string().min(8, "Use at least 8 characters").max(128),
  name: z.string().trim().min(2).max(18),
  avatar: z.number().int().min(0).max(31).default(0),
});
const Login = z.object({ email: z.string().email().max(160), password: z.string().min(1).max(128) });
const Refresh = z.object({ refreshToken: z.string().min(20).max(200) });

@Controller("auth")
// Slow down password guessing: 10 tries a minute per IP.
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("register")
  register(@Body(new ZodPipe(Register)) body: z.infer<typeof Register>) {
    return this.auth.register(body);
  }

  @Post("login")
  @HttpCode(200)
  login(@Body(new ZodPipe(Login)) body: z.infer<typeof Login>) {
    return this.auth.login(body);
  }

  @Post("refresh")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body(new ZodPipe(Refresh)) body: z.infer<typeof Refresh>) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Body(new ZodPipe(Refresh)) body: z.infer<typeof Refresh>) {
    await this.auth.logout(body.refreshToken);
  }
}
