import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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

  await app.listen({
    port: env.PORT,
    host: env.HOST,
  });

  console.log(
    `Naija Childhood API on http://${env.HOST}:${env.PORT}/v1`,
  );

  console.log(
    `Health check: http://${env.HOST}:${env.PORT}/health`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
