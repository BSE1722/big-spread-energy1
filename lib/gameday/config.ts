/**
 * BSE Game Day — Phase 1 prototype config.
 *
 * Everything in this file is static demonstration data. Nothing here is read
 * from or written to the database, auth, Stripe, or Printify.
 */

/**
 * External BSE Supply (Printify) storefront URL.
 * Paste the live Printify store URL here to activate every "Shop BSE Supply"
 * button on /gameday. While empty, the buttons stay visible but do not
 * navigate off-site.
 */
export const BSE_SUPPLY_URL = ""

export const isSupplyConfigured = BSE_SUPPLY_URL.trim().length > 0

export const DEMO_LOCKER = {
  entries: 2750,
  multiplier: "25X",
  countdown: { days: "12", hours: "08", minutes: "41" },
  entryLimit: 40000,
}

export const DEMO_ENTRY_HISTORY = [
  { source: "BSE Supply Order", entries: 1475 },
  { source: "BSE Supply Order", entries: 850 },
  { source: "Free Entry", entries: 75 },
] as const

export const DEMO_PRIZES = [
  { tier: "Grand Prize", value: "$10,000", detail: "Cash" },
  { tier: "Second Prize", value: "$1,000", detail: "Cash" },
  { tier: "Runner-Up", value: "10 × $100", detail: "BSE Supply Credit" },
] as const

export const DEMO_LEADERBOARD = [
  { name: "Moose", record: "42-18" },
  { name: "ParlaysOnly", record: "40-20" },
  { name: "SaturdayDegenerate", record: "39-21" },
  { name: "VegasHatesMe", record: "38-22" },
  { name: "BSE Model", record: "37-23", isModel: true },
] as const
