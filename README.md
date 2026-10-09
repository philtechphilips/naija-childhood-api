# Naija Childhood: backend

NestJS 11 (Fastify) + Prisma + PostgreSQL. Accounts, server-checked scores, leaderboards, daily challenges and remote config for the [Naija Childhood web app](https://github.com/philtechphilips/naija-childhood).

Scores are validated with **the same code the app uses** (`src/lib/validation.ts` and each game's `rules.ts`), so there is one source of truth for what a legal score is.

## Game rules

The API has its own copy of the game rules and score checks in [`src/lib/`](src/lib/) and [`src/games/`](src/games/), the same code as the web app, so scores are checked exactly the way the app scores them. This repo builds on its own; it doesn't need the frontend. When a game's rules change in the frontend, make the same change here.

## Run it locally

```bash
# from backend/
npm install
cp .env.example .env          # then set JWT_SECRET to a long random string
npm run db:start              # private Postgres 17 on port 54329 (data in .pgdata/)
npx prisma migrate deploy
npm run dev                   # http://localhost:4000/v1
npm test                      # API tests against naija_childhood_test
```

`db:start` uses Homebrew's `postgresql@17` binaries (`initdb` was run once into `.pgdata`). Any Postgres works: point `DATABASE_URL` at it. With Docker, run `docker compose up` from the repo root.

## API (`/v1`)

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| GET | `/health` | none | Liveness, including a database check |
| GET | `/config` | none | Remote config (cached: `max-age=60`) |
| POST | `/auth/register` | none | `{ email, password, name, avatar }` → `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | none | `{ email, password }` → same as register |
| POST | `/auth/refresh` | none | `{ refreshToken }` → a new pair (old token revoked) |
| POST | `/auth/logout` | none | `{ refreshToken }` → revoked |
| GET | `/me` | Bearer | Profile, best score per game, games played, daily completions |
| PATCH | `/me` | Bearer | `{ name?, avatar? }` |
| DELETE | `/me` | Bearer | Deletes the account and all its data |
| POST | `/sessions` | Bearer | `{ results: GameResult & { clientId, playedAt? }[] }` (up to 50). Validated, de-duplicated by `clientId` |
| GET | `/sessions` | Bearer | Your last 30 games |
| GET | `/leaderboards/:game?period=all\|week\|today&limit=50` | none | Top players (public, cacheable) |
| GET | `/leaderboards/:game/me?period=…` | Bearer | Your best and rank in that period |
| GET | `/daily?day=YYYY-MM-DD` | none | The day's challenge and who's completed it |

Days follow Lagos time (WAT, UTC+1). Weeks start on Monday.

## Security

- Passwords: argon2id.
- Access tokens: JWT, 15 minutes.
- Refresh tokens: random, stored only as SHA-256 hashes, and rotated on every use. Replaying an old refresh token revokes every session for that user.
- Login, register and refresh are rate-limited per IP (10/min, 30/min for refresh). Everything else is limited to 120/min.
- Request bodies are validated with zod. Helmet headers are on, CORS is limited to `CORS_ORIGINS`, and the body limit is 512 KB.

## Performance

- Fastify with Brotli/gzip compression.
- The all-time board reads a per-player `Best` table through a `(game, score DESC)` index.
- Weekly and daily boards aggregate ranked sessions in the window.
- Top lists are cached in-process for 20 s and dropped as soon as a new ranked score lands. Public endpoints send `Cache-Control`, so a CDN can sit in front.
- Personal endpoints are `private, no-store`.

## Deploy

```bash
docker build -t naija-childhood-api .
docker run -e DATABASE_URL=… -e JWT_SECRET=… -e CORS_ORIGINS=https://your.site -p 4000:4000 naija-childhood-api
```

The container runs `prisma migrate deploy` on start. Changing remote config is a row in `RemoteConfig` (key `app`); `npm run db:seed` writes the defaults.
