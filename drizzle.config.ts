import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { findDatabaseUrl } from "./src/server/db/url.mjs";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  // migrations want a direct (unpooled) connection when one is available
  dbCredentials: { url: findDatabaseUrl(process.env, { direct: true })! },
});
