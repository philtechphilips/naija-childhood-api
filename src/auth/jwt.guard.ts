import { createParamDecorator, Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { FastifyRequest } from "fastify";

type AuthedRequest = FastifyRequest & { userId?: string };

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

/** Requires a valid access token; puts the user id on the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = bearer(req);
    if (!token) throw new UnauthorizedException("Log in to do that");
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      req.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException("Session expired");
    }
  }
}

export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const id = ctx.switchToHttp().getRequest<AuthedRequest>().userId;
  if (!id) throw new UnauthorizedException();
  return id;
});
