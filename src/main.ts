import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Load .env for local development.
// Production should provide environment variables directly.
const envFile = join(__dirname, "../../.env");

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);

    if (m && process.env[m[1]!] === undefined) {
      process.env[m[1]!] = m[2];
    }
  }
}

async function main() {
  const { createApp } = await import("./app");
  const { loadEnv } = await import("./env");

  const env = loadEnv();

  const app = await createApp();

  // Health check endpoint
  app.get("/health", async () => {
    return {
      status: "ok",
      service: "naija-childhood-api",
      timestamp: new Date().toISOString(),
    };
  });

  // Start server
  await app.listen({
    port: env.PORT,
    host: env.HOST,
  });

  console.log(
    `Naija Childhood API running on http://${env.HOST}:${env.PORT}/v1`,
  );
  console.log(
    `Health check: http://${env.HOST}:${env.PORT}/health`,
  );
}

main().catch((e) => {
  console.error("Failed to start API:", e);
  process.exit(1);
});
