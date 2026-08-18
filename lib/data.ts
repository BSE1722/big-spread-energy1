export type Team = {
  name: string
  abbr: string
  rank?: number
  record: string
}

export type Game = {
  id: string
  kickoff: string
  network: string
  status: "upcoming" | "live"
  away: Team
  home: Team
  // Market lines
  marketSpread: number // negative favors home
  marketTotal: number
  marketMoneylineHome: number
  marketMoneylineAway: number
  // BSE projected fair lines
  fairSpread: number
  fairTotal: number
  // Derived analytics
  edgeSpread: number // points of edge on the spread
  edgeTotal: number
  bseRating: number // 0-100 conviction
  pick: string
  side: "home" | "away" | "over" | "under"
}

export const games: Game[] = [
  {
    id: "uga-bama",
    kickoff: "Sat 3:30 PM ET",
    network: "CBS",
    status: "live",
    away: { name: "Georgia", abbr: "UGA", rank: 2, record: "8-0" },
    home: { name: "Alabama", abbr: "ALA", rank: 4, record: "7-1" },
    marketSpread: -2.5,
    marketTotal: 51.5,
    marketMoneylineHome: -140,
    marketMoneylineAway: 120,
    fairSpread: -0.5,
    fairTotal: 54.5,
    edgeSpread: 2.0,
    edgeTotal: 3.0,
    bseRating: 88,
    pick: "Georgia +2.5",
    side: "away",
  },
  {
    id: "osu-mich",
    kickoff: "Sat 12:00 PM ET",
    network: "FOX",
    status: "upcoming",
    away: { name: "Ohio State", abbr: "OSU", rank: 1, record: "9-0" },
    home: { name: "Michigan", abbr: "MICH", rank: 12, record: "6-2" },
    marketSpread: -9.5,
    marketTotal: 44.5,
    marketMoneylineHome: 320,
    marketMoneylineAway: -410,
    fairSpread: -13.5,
    fairTotal: 42.0,
    edgeSpread: 4.0,
    edgeTotal: 2.5,
    bseRating: 92,
    pick: "Ohio State -9.5",
    side: "away",
  },
  {
    id: "tex-ou",
    kickoff: "Sat 7:30 PM ET",
    network: "ABC",
    status: "upcoming",
    away: { name: "Texas", abbr: "TEX", rank: 3, record: "8-1" },
    home: { name: "Oklahoma", abbr: "OU", rank: 15, record: "6-3" },
    marketSpread: -6.5,
    marketTotal: 58.5,
    marketMoneylineHome: 210,
    marketMoneylineAway: -260,
    fairSpread: -5.0,
    fairTotal: 61.0,
    edgeSpread: 1.5,
    edgeTotal: 2.5,
    bseRating: 74,
    pick: "Over 58.5",
    side: "over",
  },
  {
    id: "ore-wash",
    kickoff: "Sat 10:30 PM ET",
    network: "FOX",
    status: "upcoming",
    away: { name: "Oregon", abbr: "ORE", rank: 5, record: "8-1" },
    home: { name: "Washington", abbr: "WASH", rank: 18, record: "6-3" },
    marketSpread: -3.5,
    marketTotal: 63.5,
    marketMoneylineHome: 150,
    marketMoneylineAway: -175,
    fairSpread: -6.0,
    fairTotal: 60.0,
    edgeSpread: 2.5,
    edgeTotal: 3.5,
    bseRating: 81,
    pick: "Oregon -3.5",
    side: "away",
  },
  {
    id: "psu-osu2",
    kickoff: "Sat 4:00 PM ET",
    network: "NBC",
    status: "upcoming",
    away: { name: "Penn State", abbr: "PSU", rank: 8, record: "7-2" },
    home: { name: "Wisconsin", abbr: "WISC", rank: 22, record: "6-3" },
    marketSpread: -7.5,
    marketTotal: 45.5,
    marketMoneylineHome: 240,
    marketMoneylineAway: -300,
    fairSpread: -6.0,
    fairTotal: 47.5,
    edgeSpread: 1.5,
    edgeTotal: 2.0,
    bseRating: 63,
    pick: "Under 45.5",
    side: "under",
  },
  {
    id: "lsu-tenn",
    kickoff: "Sat 7:00 PM ET",
    network: "ESPN",
    status: "upcoming",
    away: { name: "LSU", abbr: "LSU", rank: 11, record: "7-2" },
    home: { name: "Tennessee", abbr: "TENN", rank: 9, record: "7-1" },
    marketSpread: -4.5,
    marketTotal: 60.5,
    marketMoneylineHome: -180,
    marketMoneylineAway: 155,
    fairSpread: -2.0,
    fairTotal: 63.5,
    edgeSpread: 2.5,
    edgeTotal: 3.0,
    bseRating: 77,
    pick: "LSU +4.5",
    side: "away",
  },
  {
    id: "nd-clem",
    kickoff: "Sat 12:00 PM ET",
    network: "NBC",
    status: "upcoming",
    away: { name: "Notre Dame", abbr: "ND", rank: 10, record: "8-1" },
    home: { name: "Clemson", abbr: "CLEM", rank: 20, record: "6-3" },
    marketSpread: -2.5,
    marketTotal: 47.5,
    marketMoneylineHome: 115,
    marketMoneylineAway: -135,
    fairSpread: -4.5,
    fairTotal: 45.0,
    edgeSpread: 2.0,
    edgeTotal: 2.5,
    bseRating: 70,
    pick: "Notre Dame -2.5",
    side: "away",
  },
  {
    id: "mia-fsu",
    kickoff: "Sat 8:00 PM ET",
    network: "ABC",
    status: "upcoming",
    away: { name: "Miami", abbr: "MIA", rank: 6, record: "8-1" },
    home: { name: "Florida State", abbr: "FSU", rank: 25, record: "5-4" },
    marketSpread: -8.5,
    marketTotal: 52.5,
    marketMoneylineHome: 280,
    marketMoneylineAway: -360,
    fairSpread: -11.0,
    fairTotal: 50.0,
    edgeSpread: 2.5,
    edgeTotal: 2.5,
    bseRating: 79,
    pick: "Miami -8.5",
    side: "away",
  },
]

export function edgeGrade(edge: number): { label: string; tone: "elite" | "strong" | "lean" | "pass" } {
  if (edge >= 3.5) return { label: "ELITE", tone: "elite" }
  if (edge >= 2.5) return { label: "STRONG", tone: "strong" }
  if (edge >= 1.5) return { label: "LEAN", tone: "lean" }
  return { label: "PASS", tone: "pass" }
}

export function formatSpread(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

export function formatMoneyline(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

export type BseRatingRow = {
  rank: number
  team: string
  abbr: string
  rating: number
  offense: number
  defense: number
  trend: "up" | "down" | "flat"
}

export const bseRatings: BseRatingRow[] = [
  { rank: 1, team: "Ohio State", abbr: "OSU", rating: 96.4, offense: 42.1, defense: 12.8, trend: "up" },
  { rank: 2, team: "Georgia", abbr: "UGA", rating: 94.8, offense: 38.6, defense: 14.2, trend: "flat" },
  { rank: 3, team: "Texas", abbr: "TEX", rating: 93.1, offense: 40.2, defense: 16.7, trend: "up" },
  { rank: 4, team: "Oregon", abbr: "ORE", rating: 91.7, offense: 41.8, defense: 18.1, trend: "down" },
  { rank: 5, team: "Alabama", abbr: "ALA", rating: 90.9, offense: 36.4, defense: 15.9, trend: "up" },
  { rank: 6, team: "Miami", abbr: "MIA", rating: 89.2, offense: 39.7, defense: 19.4, trend: "flat" },
  { rank: 7, team: "Notre Dame", abbr: "ND", rating: 88.5, offense: 34.1, defense: 16.2, trend: "up" },
  { rank: 8, team: "Tennessee", abbr: "TENN", rating: 87.3, offense: 38.9, defense: 20.6, trend: "down" },
]

export type ParlayLeg = {
  id: string
  game: string
  pick: string
  odds: number
  bseRating: number
  edge: number
}

export const parlayGeneratorLegs: ParlayLeg[] = [
  { id: "g1", game: "Ohio State @ Michigan", pick: "Ohio State -9.5", odds: -110, bseRating: 92, edge: 4.0 },
  { id: "g2", game: "Georgia @ Alabama", pick: "Georgia +2.5", odds: -110, bseRating: 88, edge: 2.0 },
  { id: "g3", game: "Oregon @ Washington", pick: "Oregon -3.5", odds: -110, bseRating: 81, edge: 2.5 },
  { id: "g4", game: "Miami @ Florida State", pick: "Miami -8.5", odds: -110, bseRating: 79, edge: 2.5 },
  { id: "g5", game: "LSU @ Tennessee", pick: "LSU +4.5", odds: -110, bseRating: 77, edge: 2.5 },
  { id: "g6", game: "Texas @ Oklahoma", pick: "Over 58.5", odds: -105, bseRating: 74, edge: 2.5 },
]

// Convert American odds to decimal
export function toDecimal(american: number): number {
  return american > 0 ? american / 100 + 1 : 100 / Math.abs(american) + 1
}

// Convert decimal odds back to American
export function toAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100)
  return Math.round(-100 / (decimal - 1))
}
