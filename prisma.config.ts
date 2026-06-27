import "dotenv/config"; // adding this file disables Prisma's auto .env loading
import path from "node:path";
import { defineConfig } from "prisma/config";

// Replaces the deprecated `package.json#prisma` block (removed in Prisma 7).
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    // `node --import tsx` instead of bare `tsx` so it works regardless of
    // whether node_modules/.bin is on PATH (e.g. `prisma db seed` run directly).
    seed: "node --import tsx prisma/seed.ts",
  },
});
