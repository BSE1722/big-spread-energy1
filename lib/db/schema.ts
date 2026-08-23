import { pgTable, text, timestamp, boolean, integer, unique } from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// Better Auth tables (camelCase columns match Better Auth defaults — do not
// rename). These mirror the DDL applied via the Neon MCP.
// ---------------------------------------------------------------------------
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  // Added in Better Auth 1.7: account identity is scoped by issuer.
  issuer: text("issuer"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// App tables. Per the Neon skill: plain `userId` text column for per-user
// scoping, NO foreign keys on app tables (keeps schema iteration easy).
// ---------------------------------------------------------------------------

/**
 * One free Rookie breakdown per user per (season, week). The UNIQUE constraint
 * on (userId, season, week) is the server-side guarantee that a Rookie can only
 * ever spend ONE weekly breakdown — refreshing, logging out, or switching
 * devices cannot create a second row for the same week. `gameId` records WHICH
 * game they spent it on so it stays unlocked for the rest of that week.
 */
export const weeklyUnlocks = pgTable(
  "weekly_unlocks",
  {
    id: text("id").primaryKey(),
    userId: text("userId").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    gameId: text("gameId").notNull(),
    matchup: text("matchup"),
    unlockedAt: timestamp("unlockedAt").notNull().defaultNow(),
  },
  (t) => ({
    userSeasonWeek: unique("weekly_unlocks_user_season_week_unique").on(t.userId, t.season, t.week),
  }),
)

/**
 * Pro subscription state per user, driven by Stripe webhooks. `status` is
 * "active" (or "trialing") when the user is BSE Pro. One row per user.
 */
export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().unique(),
  status: text("status").notNull().default("inactive"),
  stripeCustomerId: text("stripeCustomerId"),
  stripeSubscriptionId: text("stripeSubscriptionId"),
  priceId: text("priceId"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})
