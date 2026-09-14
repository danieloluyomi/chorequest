import fs from "node:fs";
import path from "node:path";
import { sql } from "./postgres.ts";

await sql.unsafe(
  fs.readFileSync(path.resolve("db/migrations/postgres.sql"), "utf8"),
);
await sql.end();
console.log("Supabase Postgres migrated.");
