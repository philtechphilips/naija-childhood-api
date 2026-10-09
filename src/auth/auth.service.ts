import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma.service";

const ACCESS_TTL = "15m";
const REFRESH_DAYS = 60;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatar: number;
  xp: number;
  createdAt: Date;
}

export const toPublic = (u: PublicUser): PublicUser => ({ id: u.id, email: u.email, name: u.name, avatar: u.avatar, xp: u.xp, createdAt: u.createdAt });

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async register(input: { email: string; password: string; name: string; avatar: number }) {
    const email = input.email.trim().toLowerCase();
    if (await this.db.user.findUnique({ where: { email } })) throw new ConflictException("An account with that email already exists");
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await this.db.user.create({ data: { email, passwordHash, name: input.name.trim(), avatar: input.avatar } });
    return { user: toPublic(user), ...(await this.issue(user.id)) };
  }

  async login(input: { email: string; password: string }) {
    const user = await this.db.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    // Same error either way, so the API doesn't reveal which emails are registered.
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) throw new UnauthorizedException("Wrong email or password");
    return { user: toPublic(user), ...(await this.issue(user.id)) };
  }

  /** Swaps a refresh token for a new pair; the old one stops working (rotation). */
  async refresh(token: string) {
    const row = await this.db.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      // A revoked token being replayed is a sign it was stolen: end every session for that user.
      if (row?.revokedAt) await this.db.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException("Session expired, please log in again");
    }
    await this.db.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    const user = await this.db.user.findUniqueOrThrow({ where: { id: row.userId } });
    return { user: toPublic(user), ...(await this.issue(user.id)) };
  }

  async logout(token: string) {
    await this.db.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async issue(userId: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId }, { expiresIn: ACCESS_TTL });
    const refreshToken = randomBytes(32).toString("base64url");
    await this.db.refreshToken.create({
      data: { userId, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + REFRESH_DAYS * 86_400_000) },
    });
    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }
}
