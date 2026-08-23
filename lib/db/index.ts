import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// Single shared pg Pool used by BOTH Better Auth and Drizzle so there is one
// connection and one source of truth. Do not introduce @neondatabase/serverless
// here — Better Auth needs a pg Pool.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })
