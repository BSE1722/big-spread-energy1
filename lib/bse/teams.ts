/**
 * CENTRALIZED TEAM REGISTRY — single source of truth for team branding and
 * rankings across the whole site.
 *
 *  - `TEAM_TABLE` holds every FBS team's official primary color (sourced from
 *    the CollegeFootballData API) keyed by CFBD abbreviation.
 *  - `AP_TOP_25` holds the current ESPN / Associated Press Top 25 poll.
 *
 * All lookups accept either a full school name ("Ohio State") or an
 * abbreviation ("OSU"). School names are the reliable key because the live
 * board/schedule feeds use CFBD school names verbatim, so color + rank resolve
 * consistently everywhere a team appears.
 */

export interface TeamEntry {
  name: string
  color: string
}

/** abbr -> { canonical school name, primary brand color }. */
export const TEAM_TABLE: Record<string, TeamEntry> = {
  AF: { name: "Air Force", color: "#003594" },
  AKR: { name: "Akron", color: "#041e42" },
  ALA: { name: "Alabama", color: "#9e1b32" },
  APP: { name: "App State", color: "#000000" },
  ARIZ: { name: "Arizona", color: "#cc0033" },
  ARK: { name: "Arkansas", color: "#a32136" },
  ARMY: { name: "Army", color: "#1c2b39" },
  ARST: { name: "Arkansas State", color: "#cc092f" },
  ASU: { name: "Arizona State", color: "#8c1d40" },
  AUB: { name: "Auburn", color: "#0c2340" },
  BALL: { name: "Ball State", color: "#ba0c2f" },
  BAY: { name: "Baylor", color: "#154734" },
  BC: { name: "Boston College", color: "#8c2232" },
  BGSU: { name: "Bowling Green", color: "#fd5000" },
  BOIS: { name: "Boise State", color: "#0033a0" },
  BUF: { name: "Buffalo", color: "#005bbb" },
  BYU: { name: "BYU", color: "#003da5" },
  CAL: { name: "California", color: "#041e42" },
  CCU: { name: "Coastal Carolina", color: "#006f71" },
  CIN: { name: "Cincinnati", color: "#000000" },
  CLEM: { name: "Clemson", color: "#f56600" },
  CLT: { name: "Charlotte", color: "#005035" },
  CMU: { name: "Central Michigan", color: "#6a0032" },
  COLO: { name: "Colorado", color: "#cfb87c" },
  CONN: { name: "UConn", color: "#000e2f" },
  CSU: { name: "Colorado State", color: "#1e4d2b" },
  DEL: { name: "Delaware", color: "#00539f" },
  DUKE: { name: "Duke", color: "#00539b" },
  ECU: { name: "East Carolina", color: "#592a8a" },
  EMU: { name: "Eastern Michigan", color: "#046a38" },
  FAU: { name: "Florida Atlantic", color: "#003366" },
  FIU: { name: "Florida International", color: "#091f3f" },
  FLA: { name: "Florida", color: "#0021a5" },
  FRES: { name: "Fresno State", color: "#c41230" },
  FSU: { name: "Florida State", color: "#782f40" },
  GASO: { name: "Georgia Southern", color: "#041e42" },
  GAST: { name: "Georgia State", color: "#0039a6" },
  GT: { name: "Georgia Tech", color: "#b3a369" },
  HAW: { name: "Hawai'i", color: "#024731" },
  HOU: { name: "Houston", color: "#c8102e" },
  ILL: { name: "Illinois", color: "#ff5f05" },
  IOWA: { name: "Iowa", color: "#000000" },
  ISU: { name: "Iowa State", color: "#c8102e" },
  IU: { name: "Indiana", color: "#990000" },
  JMU: { name: "James Madison", color: "#450084" },
  JXST: { name: "Jacksonville State", color: "#cc0000" },
  KENN: { name: "Kennesaw State", color: "#fdbb30" },
  KENT: { name: "Kent State", color: "#002664" },
  KSU: { name: "Kansas State", color: "#512888" },
  KU: { name: "Kansas", color: "#0051ba" },
  LIB: { name: "Liberty", color: "#0a254e" },
  LOU: { name: "Louisville", color: "#c9001f" },
  LSU: { name: "LSU", color: "#461d7c" },
  LT: { name: "Louisiana Tech", color: "#003087" },
  "M-OH": { name: "Miami (OH)", color: "#c41230" },
  MASS: { name: "Massachusetts", color: "#881c1c" },
  MD: { name: "Maryland", color: "#ce1126" },
  MEM: { name: "Memphis", color: "#00498f" },
  MIA: { name: "Miami", color: "#f47321" },
  MICH: { name: "Michigan", color: "#00274c" },
  MINN: { name: "Minnesota", color: "#7a0019" },
  MISS: { name: "Ole Miss", color: "#13294b" },
  MIZ: { name: "Missouri", color: "#f1b82d" },
  MOST: { name: "Missouri State", color: "#5e0009" },
  MRSH: { name: "Marshall", color: "#00b140" },
  MSST: { name: "Mississippi State", color: "#5d1725" },
  MSU: { name: "Michigan State", color: "#173f35" },
  MTSU: { name: "Middle Tennessee", color: "#036eb7" },
  NAVY: { name: "Navy", color: "#00225b" },
  NCSU: { name: "NC State", color: "#cc0000" },
  ND: { name: "Notre Dame", color: "#0c2340" },
  NDSU: { name: "North Dakota State", color: "#00583d" },
  NEB: { name: "Nebraska", color: "#d00000" },
  NEV: { name: "Nevada", color: "#041e42" },
  NIU: { name: "Northern Illinois", color: "#c8102e" },
  NMSU: { name: "New Mexico State", color: "#8c0b42" },
  NU: { name: "Northwestern", color: "#582c83" },
  ODU: { name: "Old Dominion", color: "#043657" },
  OHIO: { name: "Ohio", color: "#024230" },
  OKST: { name: "Oklahoma State", color: "#fe5c00" },
  ORE: { name: "Oregon", color: "#007030" },
  ORST: { name: "Oregon State", color: "#dc4405" },
  OSU: { name: "Ohio State", color: "#ba0c2f" },
  OU: { name: "Oklahoma", color: "#841617" },
  PITT: { name: "Pittsburgh", color: "#003594" },
  PSU: { name: "Penn State", color: "#001e44" },
  PUR: { name: "Purdue", color: "#ceb888" },
  RICE: { name: "Rice", color: "#00205b" },
  RUTG: { name: "Rutgers", color: "#ce0e2d" },
  SAC: { name: "Sacramento State", color: "#00573c" },
  SC: { name: "South Carolina", color: "#73000a" },
  SDSU: { name: "San Diego State", color: "#a6192e" },
  SHSU: { name: "Sam Houston", color: "#f56423" },
  SJSU: { name: "San José State", color: "#0055a2" },
  SMU: { name: "SMU", color: "#d70000" },
  STAN: { name: "Stanford", color: "#8c1515" },
  SYR: { name: "Syracuse", color: "#f76900" },
  "TA&M": { name: "Texas A&M", color: "#500000" },
  TCU: { name: "TCU", color: "#4d1979" },
  TEM: { name: "Temple", color: "#a41e35" },
  TENN: { name: "Tennessee", color: "#ff8200" },
  TEX: { name: "Texas", color: "#bf5700" },
  TLSA: { name: "Tulsa", color: "#003595" },
  TOL: { name: "Toledo", color: "#0b2240" },
  TROY: { name: "Troy", color: "#862633" },
  TTU: { name: "Texas Tech", color: "#c30020" },
  TULN: { name: "Tulane", color: "#006747" },
  TXST: { name: "Texas State", color: "#501214" },
  UAB: { name: "UAB", color: "#1a5632" },
  UCF: { name: "UCF", color: "#000000" },
  UCLA: { name: "UCLA", color: "#2774ae" },
  UGA: { name: "Georgia", color: "#ba0c2f" },
  UK: { name: "Kentucky", color: "#0033a0" },
  UL: { name: "Louisiana", color: "#ce181e" },
  ULM: { name: "UL Monroe", color: "#840029" },
  UNC: { name: "North Carolina", color: "#7bafd4" },
  UNLV: { name: "UNLV", color: "#cf0a2c" },
  UNM: { name: "New Mexico", color: "#ba0c2f" },
  UNT: { name: "North Texas", color: "#00853e" },
  USA: { name: "South Alabama", color: "#00205b" },
  USC: { name: "USC", color: "#990000" },
  USF: { name: "South Florida", color: "#006747" },
  USM: { name: "Southern Miss", color: "#ffc72c" },
  USU: { name: "Utah State", color: "#0f2439" },
  UTAH: { name: "Utah", color: "#be0000" },
  UTEP: { name: "UTEP", color: "#ff8200" },
  UTSA: { name: "UTSA", color: "#0c2340" },
  UVA: { name: "Virginia", color: "#232d4b" },
  VAN: { name: "Vanderbilt", color: "#000000" },
  VT: { name: "Virginia Tech", color: "#861f41" },
  WAKE: { name: "Wake Forest", color: "#ceb888" },
  WASH: { name: "Washington", color: "#33006f" },
  WIS: { name: "Wisconsin", color: "#a00000" },
  WKU: { name: "Western Kentucky", color: "#c60c30" },
  WMU: { name: "Western Michigan", color: "#532e1f" },
  WSU: { name: "Washington State", color: "#a60f2d" },
  WVU: { name: "West Virginia", color: "#eaaa00" },
  WYO: { name: "Wyoming", color: "#492f24" },
}

/** Fallback brand color for any team not present in the table. */
export const FALLBACK_COLOR = "#3f3f46"

/* ------------------------------- AP Top 25 ------------------------------- */

export interface ApPollEntry {
  rank: number
  /** CFBD abbreviation, used to resolve name + color from TEAM_TABLE. */
  abbr: string
  points: number
  /** First-place votes, when any. */
  firstPlaceVotes?: number
  record: string
}

/**
 * ESPN / Associated Press Top 25 — 2026 preseason poll.
 * Update this single list each week and every ranking across the site updates.
 */
export const AP_TOP_25: ApPollEntry[] = [
  { rank: 1, abbr: "OSU", points: 1672, firstPlaceVotes: 40, record: "0-0" },
  { rank: 2, abbr: "ORE", points: 1597, firstPlaceVotes: 14, record: "0-0" },
  { rank: 3, abbr: "UGA", points: 1513, record: "0-0" },
  { rank: 4, abbr: "ND", points: 1510, firstPlaceVotes: 6, record: "0-0" },
  { rank: 5, abbr: "TEX", points: 1483, record: "0-0" },
  { rank: 6, abbr: "IU", points: 1440, firstPlaceVotes: 8, record: "0-0" },
  { rank: 7, abbr: "MIA", points: 1379, firstPlaceVotes: 1, record: "0-0" },
  { rank: 8, abbr: "TA&M", points: 1131, record: "0-0" },
  { rank: 9, abbr: "MISS", points: 1102, record: "0-0" },
  { rank: 10, abbr: "OU", points: 1047, record: "0-0" },
  { rank: 11, abbr: "LSU", points: 988, record: "0-0" },
  { rank: 12, abbr: "TTU", points: 983, record: "0-0" },
  { rank: 13, abbr: "ALA", points: 904, record: "0-0" },
  { rank: 14, abbr: "USC", points: 839, record: "0-0" },
  { rank: 14, abbr: "BYU", points: 839, record: "0-0" },
  { rank: 16, abbr: "MICH", points: 718, record: "0-0" },
  { rank: 17, abbr: "WASH", points: 501, record: "0-0" },
  { rank: 18, abbr: "PSU", points: 482, record: "0-0" },
  { rank: 19, abbr: "SMU", points: 434, record: "0-0" },
  { rank: 20, abbr: "TENN", points: 394, record: "0-0" },
  { rank: 21, abbr: "UTAH", points: 304, record: "0-0" },
  { rank: 22, abbr: "IOWA", points: 260, record: "0-0" },
  { rank: 23, abbr: "HOU", points: 252, record: "0-0" },
  { rank: 24, abbr: "LOU", points: 194, record: "0-0" },
  { rank: 25, abbr: "MIZ", points: 117, record: "0-0" },
]

/* ------------------------------- Indexes -------------------------------- */

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // strip punctuation/spaces
    .trim()
}

/** normalized school name -> abbr */
const NAME_TO_ABBR = new Map<string, string>()
for (const [abbr, entry] of Object.entries(TEAM_TABLE)) {
  NAME_TO_ABBR.set(normalize(entry.name), abbr)
}

/** A few common name variants that differ from CFBD's canonical school name. */
const NAME_ALIASES: Record<string, string> = {
  [normalize("Miami (FL)")]: "MIA",
  [normalize("Miami FL")]: "MIA",
  [normalize("Miami Florida")]: "MIA",
  [normalize("Hawaii")]: "HAW",
  [normalize("San Jose State")]: "SJSU",
  [normalize("Louisiana Lafayette")]: "UL",
  [normalize("UL Lafayette")]: "UL",
  [normalize("Southern California")]: "USC",
  [normalize("Pitt")]: "PITT",
  [normalize("UMass")]: "MASS",
}

/** abbr -> AP rank (ties share a rank; only the first 25 are ranked). */
const ABBR_TO_RANK = new Map<string, number>()
for (const e of AP_TOP_25) ABBR_TO_RANK.set(e.abbr, e.rank)

/* ------------------------------- Lookups -------------------------------- */

/** Resolve a name or abbreviation to a canonical CFBD abbreviation, if known. */
export function resolveAbbr(input?: string | null): string | undefined {
  if (!input) return undefined
  const raw = input.trim()
  if (TEAM_TABLE[raw]) return raw // already an abbr
  const upper = raw.toUpperCase()
  if (TEAM_TABLE[upper]) return upper
  const norm = normalize(raw)
  return NAME_TO_ABBR.get(norm) ?? NAME_ALIASES[norm]
}

/** Primary brand color for a team (accepts name or abbr). */
export function getTeamColor(input?: string | null): string {
  const abbr = resolveAbbr(input)
  return abbr ? TEAM_TABLE[abbr].color : FALLBACK_COLOR
}

/** AP Top 25 rank for a team (accepts name or abbr), or undefined if unranked. */
export function getTeamRank(input?: string | null): number | undefined {
  const abbr = resolveAbbr(input)
  return abbr ? ABBR_TO_RANK.get(abbr) : undefined
}

export interface ApRankRow {
  rank: number
  name: string
  abbr: string
  color: string
  points: number
  firstPlaceVotes?: number
  record: string
}

/** The AP Top 25 enriched with canonical name + color for rendering. */
export function getApTop25(): ApRankRow[] {
  return AP_TOP_25.map((e) => {
    const entry = TEAM_TABLE[e.abbr]
    return {
      rank: e.rank,
      name: entry?.name ?? e.abbr,
      abbr: e.abbr,
      color: entry?.color ?? FALLBACK_COLOR,
      points: e.points,
      firstPlaceVotes: e.firstPlaceVotes,
      record: e.record,
    }
  })
}
