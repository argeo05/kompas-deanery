import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { seedKb } from "./kb";

// pnpm db:seed-kb — дозагружает справочник в уже засеянную базу (идемпотентно).
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан");
const client = postgres(url, { max: 1, onnotice: () => {} });
await seedKb(drizzle(client, { schema }));
await client.end();
console.log("Справочник загружен");
