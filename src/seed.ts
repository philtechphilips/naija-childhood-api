/** Writes the default remote config row (safe to run repeatedly). */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_CONFIG } from "./remote-config/remote-config.service";

const db = new PrismaClient();
db.remoteConfig
  .upsert({ where: { key: "app" }, create: { key: "app", value: DEFAULT_CONFIG }, update: {} })
  .then(() => console.log("remote config seeded"))
  .finally(() => db.$disconnect());
