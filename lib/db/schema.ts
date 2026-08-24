import { pgTable, text, timestamp, boolean, integer, unique, doublePrecision, jsonb, index } from "drizzle-orm/pg-core"

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
  // Authorization role. 'admin' unlocks the owner dashboard + admin APIs.
  // Enforced server-side only; never trust a client-supplied role.
  role: text("role").notNull().default("user"),
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
  priceInterval: text("priceInterval"),
  currentPeriodStart: timestamp("currentPeriodStart", { withTimezone: true }),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  // When true, the sub is set to end at currentPeriodEnd (user canceled but
  // still has paid access until then). canceledAt is when Stripe fully ended it.
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
  canceledAt: timestamp("canceledAt", { withTimezone: true }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/**
 * Webhook idempotency ledger. Every Stripe event ID we finish processing is
 * recorded here; the webhook refuses to process an ID that already exists, so
 * Stripe's at-least-once redelivery can never double-apply a lifecycle change.
 */
export const processedStripeEvents = pgTable("processed_stripe_events", {
  id: text("id").primaryKey(), // Stripe event id (evt_...)
  type: text("type").notNull(),
  processedAt: timestamp("processedAt", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Append-only payment/subscription audit trail, populated from verified Stripe
 * webhook events. Powers the admin dashboard's payment history. Never written
 * from the client.
 */
export const paymentHistory = pgTable(
  "payment_history",
  {
    id: text("id").primaryKey(),
    userId: text("userId"),
    stripeCustomerId: text("stripeCustomerId"),
    stripeInvoiceId: text("stripeInvoiceId"),
    stripeEventId: text("stripeEventId"),
    // invoice.paid | invoice.payment_failed | subscription.canceled | ...
    type: text("type").notNull(),
    status: text("status"),
    amount: integer("amount"), // minor units (cents)
    currency: text("currency"),
    description: text("description"),
    periodStart: timestamp("periodStart", { withTimezone: true }),
    periodEnd: timestamp("periodEnd", { withTimezone: true }),
    occurredAt: timestamp("occurredAt", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("payment_history_user_idx").on(t.userId, t.occurredAt),
  }),
)

// ---------------------------------------------------------------------------
// Weather ingestion (INFRASTRUCTURE ONLY — no model math here).
//
// SOURCE-OF-TRUTH SPLIT (unchanged):
//   - CFBD  → schedule, teams, kickoff, venue identity.
//   - SGO/DraftKings → betting markets (frozen Blob snapshot, never touched here).
//   - Weather → this pair of tables ONLY. Fully independent of the odds snapshot.
// ---------------------------------------------------------------------------

/**
 * Static CFBD venue reference: real stadium coordinates + dome flag + timezone.
 * Weather is tied to THESE coordinates and the scheduled kickoff — never the
 * team's home city. `dome = true` means outdoor weather is not a factor and we
 * skip the forecast fetch entirely.
 */
export const venues = pgTable("venues", {
  id: integer("id").primaryKey(), // CFBD venue_id
  name: text("name"),
  city: text("city"),
  state: text("state"),
  countryCode: text("country_code"),
  timezone: text("timezone"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  elevation: doublePrecision("elevation"),
  dome: boolean("dome").notNull().default(false),
  grass: boolean("grass"),
  capacity: integer("capacity"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/**
 * Append-only historical weather forecasts per game. Each refresh inserts a new
 * row (keyed by cfbdGameId + fetchedAt) so we retain the full forecast history,
 * the lead time before kickoff, and the exact game-time reading the model will
 * eventually consume (`isFinalPregame`). `raw` keeps the full provider payload
 * for auditing/backtesting. NO fair-line or BSE-rating math lives here.
 */
export const gameWeather = pgTable(
  "game_weather",
  {
    id: text("id").primaryKey(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    cfbdGameId: text("cfbdGameId").notNull(),
    venueId: integer("venueId"),
    kickoff: timestamp("kickoff", { withTimezone: true }),
    kickoffTBD: boolean("kickoffTBD").notNull().default(false),
    /** Dome/indoor: outdoor weather intentionally not applied. */
    indoor: boolean("indoor").notNull().default(false),
    provider: text("provider").notNull(),
    fetchedAt: timestamp("fetchedAt", { withTimezone: true }).notNull().defaultNow(),
    /** The exact forecast hour requested (== kickoff hour in venue tz). */
    forecastValidFor: timestamp("forecastValidFor", { withTimezone: true }),
    /** Minutes between fetchedAt and kickoff (forecast lead time). */
    leadTimeMinutes: integer("leadTimeMinutes"),
    /** Set on the last pre-kickoff reading — the official game-time record. */
    isFinalPregame: boolean("isFinalPregame").notNull().default(false),
    /** ok | indoor | pending_kickoff | unavailable */
    dataStatus: text("dataStatus").notNull().default("ok"),
    temperatureF: doublePrecision("temperatureF"),
    apparentTemperatureF: doublePrecision("apparentTemperatureF"),
    humidityPct: doublePrecision("humidityPct"),
    windSpeedMph: doublePrecision("windSpeedMph"),
    windGustMph: doublePrecision("windGustMph"),
    windDirectionDeg: doublePrecision("windDirectionDeg"),
    precipitationProbabilityPct: doublePrecision("precipitationProbabilityPct"),
    precipitationIntensityMm: doublePrecision("precipitationIntensityMm"),
    precipitationType: text("precipitationType"),
    rainMm: doublePrecision("rainMm"),
    snowfallCm: doublePrecision("snowfallCm"),
    cloudCoverPct: doublePrecision("cloudCoverPct"),
    weatherCode: integer("weatherCode"),
    weatherDescription: text("weatherDescription"),
    severe: boolean("severe").notNull().default(false),
    raw: jsonb("raw"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    gameFetched: unique("game_weather_game_fetched_unique").on(t.cfbdGameId, t.fetchedAt),
    gameIdx: index("game_weather_game_idx").on(t.cfbdGameId, t.fetchedAt),
    seasonWeekIdx: index("game_weather_season_week_idx").on(t.season, t.week),
  }),
)
