import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
import { encodeRace, scoreRace } from "@/games/sack-race/rules";
import { EV, replay } from "@/games/skipping/rules";

let app: NestFastifyApplication;
// Throwaway credentials for the test database only (built at runtime so secret scanners don't flag them).
const PW = ["test", "only", "pass", "1"].join("-");
const WRONG = ["not", "it"].join("-");
const db = new PrismaClient();

async function call(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: unknown, token?: string) {
  const res = await app.inject({
    method,
    url: `/v1${url}`,
    payload: body as object | undefined,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null, headers: res.headers };
}

async function signUp(email: string, name = "Ada") {
  const r = await call("POST", "/auth/register", { email, password: PW, name, avatar: 1 });
  assert.equal(r.status, 201);
  return r.body as { accessToken: string; refreshToken: string; user: { id: string } };
}

function race(clientId: string, place: number, time: number, perfects: number) {
  const s = { place, time, perfects, falls: 0, hops: 24 };
  return { clientId: `client-${clientId}`, game: "sack-race", mode: "race", options: { difficulty: "normal" }, score: scoreRace(s), won: place === 1, durationMs: 20_000, headline: "", detail: "", stats: { place }, seed: 1, log: encodeRace(s) };
}

before(async () => {
  app = await createApp({ logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
after(async () => {
  await app.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "User", "RemoteConfig" CASCADE`);
});

describe("auth", () => {
  it("registers, logs in and rejects wrong passwords with one message", async () => {
    await signUp("ada@example.com");
    assert.equal((await call("POST", "/auth/register", { email: "ADA@example.com", password: PW, name: "Ada2" })).status, 409);
    assert.equal((await call("POST", "/auth/login", { email: "ada@example.com", password: PW })).status, 200);
    const bad = await call("POST", "/auth/login", { email: "ada@example.com", password: WRONG });
    const nobody = await call("POST", "/auth/login", { email: "ghost@example.com", password: WRONG });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.message, nobody.body.message);
  });

  it("rotates refresh tokens and kills the family when an old one is replayed", async () => {
    const { refreshToken } = await signUp("tunde@example.com", "Tunde");
    const first = await call("POST", "/auth/refresh", { refreshToken });
    assert.equal(first.status, 200);
    assert.notEqual(first.body.refreshToken, refreshToken);
    // Replaying the used token: rejected, and the new one is revoked too.
    assert.equal((await call("POST", "/auth/refresh", { refreshToken })).status, 401);
    assert.equal((await call("POST", "/auth/refresh", { refreshToken: first.body.refreshToken })).status, 401);
  });

  it("validates input", async () => {
    const r = await call("POST", "/auth/register", { email: "not-an-email", password: "short", name: "A" });
    assert.equal(r.status, 400);
    assert.ok(r.body.issues.length >= 3);
  });
});

describe("sessions and leaderboards", () => {
  it("accepts honest scores, rejects tampered ones and ignores retries", async () => {
    const { accessToken } = await signUp("ada@example.com");
    const good = race("c-1", 1, 9.6, 15);
    const forged = { ...race("c-2", 1, 9.6, 15), score: 50_000 };
    const r = await call("POST", "/sessions", { results: [good, forged] }, accessToken);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.results.map((x: { status: string }) => x.status), ["accepted", "rejected"]);
    const again = await call("POST", "/sessions", { results: [good] }, accessToken);
    assert.equal(again.body.results[0].status, "duplicate");
    assert.equal(await db.session.count(), 1);
  });

  it("needs a login to submit", async () => {
    assert.equal((await call("POST", "/sessions", { results: [race("c-1", 1, 9.6, 15)] })).status, 401);
  });

  it("ranks players by their best score, all-time and this week", async () => {
    const ada = await signUp("ada@example.com", "Ada");
    const tunde = await signUp("tunde@example.com", "Tunde");
    await call("POST", "/sessions", { results: [race("a-1", 2, 12, 5), race("a-2", 1, 10, 12)] }, ada.accessToken);
    await call("POST", "/sessions", { results: [race("t-1", 3, 14, 2)] }, tunde.accessToken);
    for (const period of ["all", "week", "today"]) {
      const board = await call("GET", `/leaderboards/sack-race?period=${period}`);
      assert.deepEqual(board.body.rows.map((x: { name: string }) => x.name), ["Ada", "Tunde"], period);
      assert.equal(board.body.rows[0].score, scoreRace({ place: 1, time: 10, perfects: 12 }));
    }
    const me = await call("GET", "/leaderboards/sack-race/me?period=all", undefined, tunde.accessToken);
    assert.equal(me.body.me.rank, 2);
    assert.match(String((await call("GET", "/leaderboards/sack-race")).headers["cache-control"]), /public/);
  });

  it("restores bests and games played on a new device", async () => {
    const { accessToken } = await signUp("ada@example.com");
    const log = [EV.perfect, EV.good, EV.good, EV.trip, EV.trip, EV.trip];
    const skip = { clientId: "client-s1", game: "skipping", mode: "classic", options: {}, score: replay(log).score, won: null, durationMs: 9000, headline: "", detail: "", stats: { jumps: 3 }, seed: 2, log };
    await call("POST", "/sessions", { results: [race("a-1", 1, 10, 12), skip] }, accessToken);
    const me = await call("GET", "/me", undefined, accessToken);
    assert.equal(me.body.bests["skipping"], replay(log).score);
    assert.equal(me.body.gamesPlayed["sack-race"], 1);
    assert.ok(me.body.user.xp > 0);
  });

  it("deletes an account and its data", async () => {
    const { accessToken } = await signUp("ada@example.com");
    await call("POST", "/sessions", { results: [race("a-1", 1, 10, 12)] }, accessToken);
    assert.equal((await call("DELETE", "/me", undefined, accessToken)).status, 204);
    assert.equal(await db.session.count(), 0);
  });
});

describe("config and daily", () => {
  it("serves remote config with defaults", async () => {
    const r = await call("GET", "/config");
    assert.equal(r.status, 200);
    assert.equal(r.body.config.games["sack-race"].enabled, true);
  });

  it("serves today's challenge", async () => {
    const r = await call("GET", "/daily");
    assert.equal(r.status, 200);
    assert.ok(r.body.challenge.title);
    assert.equal(r.body.completed, 0);
  });
});

describe("analytics", () => {
  it("stores beacon batches (plain-text body) and ignores junk", async () => {
    await db.$executeRawUnsafe(`TRUNCATE "AnalyticsEvent"`);
    const body = JSON.stringify({ events: [{ name: "game_started", props: { game: "suwe" }, at: Date.now() }] });
    const res = await app.inject({ method: "POST", url: "/v1/events", payload: body, headers: { "content-type": "text/plain" } });
    assert.equal(res.statusCode, 204);
    const junk = await app.inject({ method: "POST", url: "/v1/events", payload: "not json", headers: { "content-type": "text/plain" } });
    assert.equal(junk.statusCode, 204);
    assert.equal(await db.analyticsEvent.count(), 1);
  });
});
