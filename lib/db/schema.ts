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
 * Editable app configuration, keyed by a stable string. Powers admin-tunable
 * settings (e.g. free-tier tool limits) WITHOUT a redeploy. `value` is jsonb so
 * a single row can hold a small object (e.g. { analyzerFreeWeekly, parlaidFreeWeekly }).
 * Written by admins only; readers fall back to hard-coded defaults if a key is
 * absent, so the app is always functional even before the row is seeded.
 */
export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updatedBy"),
})

/**
 * Per-user tool-usage ledger. One row per COMPLETED, SUCCESSFUL tool run,
 * scoped to the (season, week) it was run for so weekly limits reset implicitly
 * as the week rolls over (a new week simply has no rows — we never delete).
 *
 * `requestHash` makes counting idempotent and refresh/logout/device proof: it
 * is a deterministic signature of (userId, season, week, seasonType, tool,
 * normalized inputs), and the UNIQUE (userId, tool, requestHash) constraint
 * means re-running or refreshing the SAME ticket can never consume a second
 * allowance. `payload` stores the last generated/analyzed result so an
 * at-limit user can be re-shown their most recent ticket read-only.
 */
export const toolUsage = pgTable(
  "tool_usage",
  {
    id: text("id").primaryKey(),
    userId: text("userId").notNull(),
    tool: text("tool").notNull(), // analyzer | parlaid
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    seasonType: text("seasonType").notNull().default("regular"),
    requestHash: text("requestHash").notNull(),
    payload: jsonb("payload"),
    ticketId: text("ticketId"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userToolHashUnique: unique("tool_usage_user_tool_hash_unique").on(t.userId, t.tool, t.requestHash),
    userToolWeekIdx: index("tool_usage_user_tool_week_idx").on(t.userId, t.tool, t.season, t.week, t.seasonType),
  }),
)

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
// BSE Verified Track Record.
//
// SCOPE: only picks an admin EXPLICITLY publishes as an Official BSE Pick live
// here. The Board may analyze every game of the week; those never enter this
// table. Each row is FROZEN IMMUTABLY at publication (before kickoff) and later
// graded from official CFBD final scores. There is intentionally NO `void`
// status and NO edit path — corrections are append-only (see below) so a
// published loss can never be hidden or rewritten.
// ---------------------------------------------------------------------------

/**
 * One Official BSE Pick, frozen at publication. The UNIQUE (gameId, market)
 * constraint guarantees exactly one official selection per game/market — you
 * cannot publish both sides of a spread/moneyline as separate official picks.
 */
export const predictions = pgTable(
  "predictions",
  {
    id: text("id").primaryKey(),
    // CFBD identity (gameId is `cfbd-<id>`), used to batch-grade by week.
    gameId: text("gameId").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    seasonType: text("seasonType").notNull(),
    homeTeam: text("homeTeam").notNull(),
    awayTeam: text("awayTeam").notNull(),

    // Publication + kickoff. Frozen at publish; kickoff only closes the market
    // to NEW official picks — it does not change an already-frozen row.
    publishedAt: timestamp("publishedAt", { withTimezone: true }).notNull().defaultNow(),
    kickoff: timestamp("kickoff", { withTimezone: true }).notNull(),

    // The pick itself.
    market: text("market").notNull(), // spread | total | moneyline
    pickSide: text("pickSide").notNull(), // home | away | over | under
    pickLabel: text("pickLabel").notNull(), // e.g. "Georgia -6.5" / "Over 58.5"

    // Frozen REAL market (required). Grading always uses lineValue.
    lineValue: doublePrecision("lineValue"), // null only for moneyline
    priceAmerican: integer("priceAmerican"), // frozen American odds for units
    book: text("book").notNull().default("draftkings"),
    marketSnapshotAt: timestamp("marketSnapshotAt", { withTimezone: true }),

    // Frozen model fields — REAL value or NULL. Never fabricated.
    bseRating: doublePrecision("bseRating"),
    fairLine: doublePrecision("fairLine"),
    edgeValue: doublePrecision("edgeValue"),
    winProb: doublePrecision("winProb"),
    modelIsPlaceholder: boolean("modelIsPlaceholder").notNull().default(true),
    // REQUIRED. "manual-pre-model" now; "BSE-v1.0" once the real model ships.
    // Historical picks are NEVER recomputed with a newer version.
    modelVersion: text("modelVersion").notNull(),

    // Tamper-evidence. Server-generated only; the client never supplies it.
    lockHash: text("lockHash").notNull(),
    publishedBy: text("publishedBy"), // admin userId

    // Result (filled by grading).
    status: text("status").notNull().default("locked"), // locked | graded
    homeScore: integer("homeScore"),
    awayScore: integer("awayScore"),
    grade: text("grade"), // win | loss | push
    unitsDelta: doublePrecision("unitsDelta"),
    gradedAt: timestamp("gradedAt", { withTimezone: true }),
    gradedSource: text("gradedSource"), // e.g. "cfbd"

    hasCorrection: boolean("hasCorrection").notNull().default(false),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    gameMarketUnique: unique("predictions_game_market_unique").on(t.gameId, t.market),
    statusIdx: index("predictions_status_idx").on(t.status),
    seasonWeekIdx: index("predictions_season_week_idx").on(t.season, t.week, t.seasonType),
    // Eligibility query for grading: locked picks past kickoff.
    statusKickoffIdx: index("predictions_status_kickoff_idx").on(t.status, t.kickoff),
  }),
)

/**
 * Append-only correction audit. If a genuine technical/data error must be
 * corrected, a row is inserted here recording the original value, corrected
 * value, reason, admin, and time. The ORIGINAL prediction row is never
 * overwritten — the public page shows both. Corrections can never delete a pick
 * or hide a loss.
 */
export const predictionCorrections = pgTable("prediction_corrections", {
  id: text("id").primaryKey(),
  predictionId: text("predictionId").notNull(),
  field: text("field").notNull(),
  originalValue: text("originalValue"),
  correctedValue: text("correctedValue"),
  reason: text("reason").notNull(),
  adminUserId: text("adminUserId"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Internal API-usage log for the grading engine. Every grading run (cron or
 * manual) appends a row so the admin can confirm CFBD requests are conserved.
 * Never exposed publicly.
 */
export const gradingRuns = pgTable("grading_runs", {
  id: text("id").primaryKey(),
  trigger: text("trigger").notNull(), // cron | manual
  startedAt: timestamp("startedAt", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finishedAt", { withTimezone: true }),
  eligibleCount: integer("eligibleCount").notNull().default(0),
  weekGroups: integer("weekGroups").notNull().default(0),
  cfbdRequests: integer("cfbdRequests").notNull().default(0),
  gradedCount: integer("gradedCount").notNull().default(0),
  reason: text("reason"),
  error: text("error"),
})

// ---------------------------------------------------------------------------
// POSTGAME BSE REVIEW — honest validation dataset.
//
// SCOPE: an admin-owned record of analyzed parlays ("tickets") that are FROZEN
// at analysis time and later graded from official CFBD final scores, then a
// deterministic postmortem is derived from the recorded fields.
//
// TWO IMMUTABLE ZONES per leg:
//   1. PREGAME snapshot — everything the analyzer knew before kickoff. Written
//      ONCE at record time and NEVER mutated afterward. Hindsight can never
//      alter the original prediction (the whole point of the dataset).
//   2. GRADED results — filled once from CFBD finals. Idempotent; only written
//      while the leg is still "pending".
//
// HONESTY RULE: bseRating is the REAL rating that existed at analysis time, or
// NULL. It is never fabricated, inferred, recalculated, or overwritten. Legs
// without a real rating are excluded from confidence-calibration buckets.
// ---------------------------------------------------------------------------

/**
 * One analyzed parlay ("ticket"), frozen at analysis time. `ticketNumber` is a
 * human sequential id (#001, #002...). Ticket-level graded results are DERIVED
 * from the legs; the `recorded*` columns hold an admin-asserted whole-ticket
 * ground truth (used for historical tickets whose individual legs may not all
 * be captured) and are shown alongside — never in place of — the graded counts.
 */
export const reviewTickets = pgTable(
  "review_tickets",
  {
    id: text("id").primaryKey(),
    ticketNumber: integer("ticketNumber").notNull(),
    title: text("title"),
    // 'admin' = recorded via the dashboard form; 'analyzer' = snapshotted from
    // the interactive analyzer's live ticket.
    source: text("source").notNull().default("admin"),

    season: integer("season").notNull(),
    week: integer("week").notNull(),
    seasonType: text("seasonType").notNull().default("regular"),

    // Frozen analysis time + who recorded it.
    analyzedAt: timestamp("analyzedAt", { withTimezone: true }).notNull(),
    createdBy: text("createdBy"),
    // Account that owns this snapshot (analyzer/tool saves). NULL for legacy
    // admin-entered tickets. Plain text userId per the Neon scoping pattern.
    userId: text("userId"),
    notes: text("notes"),

    // Real combined parlay price (juice), when every leg had a price. Never EV.
    combinedPriceAmerican: integer("combinedPriceAmerican"),
    legCount: integer("legCount").notNull().default(0),

    // Pregame ticket-fragility, computed at record time and FROZEN.
    fragilityTier: text("fragilityTier"), // LOW | MODERATE | HIGH | EXTREME
    fragilityScore: doublePrecision("fragilityScore"),
    fragilityReasons: jsonb("fragilityReasons"),
    // Which legIndex was flagged the pregame weakest link.
    weakestLegIndex: integer("weakestLegIndex"),

    // Admin-asserted whole-ticket ground truth (optional). For Ticket #001 the
    // owner recorded 6 legs / 4-2; these are displayed as "recorded" facts and
    // never overwrite the counts computed from individually-graded legs.
    recordedLegCount: integer("recordedLegCount"),
    recordedWins: integer("recordedWins"),
    recordedLosses: integer("recordedLosses"),
    recordedPushes: integer("recordedPushes"),

    // Tamper-evidence over the frozen pregame content. Server-generated only.
    lockHash: text("lockHash").notNull(),

    // Derived graded result (from legs).
    status: text("status").notNull().default("pending"), // pending | graded
    overallGrade: text("overallGrade"), // win | loss
    legsWon: integer("legsWon"),
    legsLost: integer("legsLost"),
    legsPushed: integer("legsPushed"),
    individualWinRate: doublePrecision("individualWinRate"),
    gradedAt: timestamp("gradedAt", { withTimezone: true }),
    gradedSource: text("gradedSource"),

    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ticketNumberUnique: unique("review_tickets_number_unique").on(t.ticketNumber),
    statusIdx: index("review_tickets_status_idx").on(t.status),
    seasonWeekIdx: index("review_tickets_season_week_idx").on(t.season, t.week, t.seasonType),
    userIdx: index("review_tickets_user_idx").on(t.userId),
  }),
)

/**
 * One leg of a review ticket. The pregame columns are frozen at record time;
 * the graded columns are filled once from CFBD finals. `gameId` is `cfbd-<id>`
 * to match the same CFBD lookup the Official Picks grader uses.
 */
export const reviewLegs = pgTable(
  "review_legs",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticketId").notNull(),
    legIndex: integer("legIndex").notNull(),

    // ---- PREGAME (immutable) ----
    gameId: text("gameId"), // cfbd-<id>; null when the game could not be resolved
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    seasonType: text("seasonType").notNull().default("regular"),
    homeTeam: text("homeTeam").notNull(),
    awayTeam: text("awayTeam").notNull(),
    kickoff: timestamp("kickoff", { withTimezone: true }),

    market: text("market").notNull().default("spread"), // spread | total | moneyline
    pickSide: text("pickSide").notNull(), // home | away | over | under
    pickLabel: text("pickLabel").notNull(), // e.g. "Georgia Tech -2.5"
    // Frozen line relative to the PICKED team (matches gradePick's convention).
    lineValue: doublePrecision("lineValue"),
    priceAmerican: integer("priceAmerican"),
    book: text("book").notNull().default("draftkings"),

    // Real analyzer read at analysis time — REAL value or NULL, never fabricated.
    bseRating: doublePrecision("bseRating"),
    classification: text("classification"), // STRONG_LINE_PRICE_OK | ...
    lineEdge: doublePrecision("lineEdge"), // points better than BSE fair
    fairLine: doublePrecision("fairLine"), // home-relative BSE fair spread
    recommendation: text("recommendation"),
    confidenceRead: text("confidenceRead"),
    riskFlags: jsonb("riskFlags"), // [{code,label,detail}]
    altRecommendation: jsonb("altRecommendation"), // {pickedSpread,price,verdict,worthwhile}
    contextInfo: jsonb("contextInfo"), // weather/injury/matchup/market at analysis
    analyzedAt: timestamp("analyzedAt", { withTimezone: true }).notNull(),
    lockHash: text("lockHash").notNull(),

    // ---- GRADED (filled from CFBD finals; never touches pregame) ----
    status: text("status").notNull().default("pending"), // pending | graded
    homeScore: integer("homeScore"),
    awayScore: integer("awayScore"),
    grade: text("grade"), // win | loss | push
    unitsDelta: doublePrecision("unitsDelta"),
    favoriteWonOutright: boolean("favoriteWonOutright"),
    // Picked-team actual margin (home/away points differential for the pick side).
    actualMargin: doublePrecision("actualMargin"),
    // Margin the pick needed to cover (= -lineValue for a spread).
    requiredMargin: doublePrecision("requiredMargin"),
    // actualMargin + lineValue: > 0 covered, = 0 push, < 0 missed.
    marginVsSpread: doublePrecision("marginVsSpread"),
    altWouldHaveWon: boolean("altWouldHaveWon"),
    // saved | improved_not_needed | still_lost | favorite_lost_no_protection | na
    altProtectionOutcome: text("altProtectionOutcome"),
    gradedAt: timestamp("gradedAt", { withTimezone: true }),
    gradedSource: text("gradedSource"),

    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ticketLegUnique: unique("review_legs_ticket_leg_unique").on(t.ticketId, t.legIndex),
    ticketIdx: index("review_legs_ticket_idx").on(t.ticketId),
    statusIdx: index("review_legs_status_idx").on(t.status),
    seasonWeekIdx: index("review_legs_season_week_idx").on(t.season, t.week, t.seasonType),
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
