"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Search, X, CalendarClock, ChevronRight } from "lucide-react"
import { TeamLogo } from "@/components/team-logo"
import { TeamName } from "@/components/team-name"
import { getTeamRank } from "@/lib/bse"
import { cn } from "@/lib/utils"

type TeamOption = {
  name: string
  abbr: string
  rank?: number
}

type CfbdTeam = {
  school: string
  abbreviation?: string | null
}

type CfbdGame = {
  id: number
  week: number
  startDate: string
  startTimeTBD: boolean
  homeTeam: string
  awayTeam: string
  homeConference?: string | null
  awayConference?: string | null
  venue?: string | null
}

function useTeamOptions(): TeamOption[] {
  const [teams, setTeams] = useState<TeamOption[]>([])

  useEffect(() => {
    async function loadTeams() {
      try {
        const res = await fetch("/api/cfbd-teams")
        if (!res.ok) {
          throw new Error(`Team request failed: ${res.status}`)
        }
        const data = await res.json()
        const teamOptions: TeamOption[] = Array.isArray(data.teams)
          ? data.teams.map((team: CfbdTeam) => ({
              name: team.school,
              abbr: team.abbreviation || team.school,
            }))
          : []
        setTeams(teamOptions)
      } catch (error) {
        console.error("Failed to load CFBD teams:", error)
        setTeams([])
      }
    }

    loadTeams()
  }, [])

  return teams
}

/**
 * Set of game IDs on the CURRENT week's board, in the same `cfbd-<id>` format
 * the breakdown route resolves. A schedule game is openable iff its ID is in
 * here — future-week games have no breakdown yet, so we must not link them to a
 * 404. Kept honest by reading the same live board feed The Board itself uses.
 */
function useCurrentBoardGameIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function loadBoard() {
      try {
        const res = await fetch("/api/cfbd-board")
        if (!res.ok) return
        const data = await res.json()
        const gameIds: string[] = Array.isArray(data.games)
          ? data.games.map((g: { id: string }) => g.id).filter(Boolean)
          : []
        setIds(new Set(gameIds))
      } catch (error) {
        console.error("Failed to load board game IDs:", error)
      }
    }
    loadBoard()
  }, [])

  return ids
}

export function TeamSearch() {
  const teams = useTeamOptions()
  const boardGameIds = useCurrentBoardGameIds()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [liveGames, setLiveGames] = useState<CfbdGame[]>([])
  const [loadingGames, setLoadingGames] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return teams
      .filter((t) => t.name.toLowerCase().includes(q) || t.abbr.toLowerCase().includes(q))
      .slice(0, 6)
  }, [query, teams])

  async function choose(team: string) {
    setSelected(team)
    setQuery(team)
    setOpen(false)
    inputRef.current?.blur()

    setLoadingGames(true)
    setLiveGames([])

    try {
      const res = await fetch(`/api/cfbd-team-games?team=${encodeURIComponent(team)}`)
      if (!res.ok) {
        throw new Error(`Game request failed: ${res.status}`)
      }
      const data = await res.json()
      setLiveGames(Array.isArray(data.games) ? data.games : [])
    } catch (error) {
      console.error("Failed to load CFBD team games:", error)
      setLiveGames([])
    } finally {
      setLoadingGames(false)
    }
  }

  function clear() {
    setSelected(null)
    setQuery("")
    setOpen(false)
    setLiveGames([])
    setLoadingGames(false)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter" && suggestions.length > 0) choose(suggestions[0].name)
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      choose(suggestions[active]?.name ?? suggestions[0].name)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const results = liveGames

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-primary" />
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
          Find a team&apos;s next games
        </h2>
      </div>

      {/* Search input */}
      <div className="relative mt-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(null)
              setOpen(true)
              setActive(0)
            }}
            onFocus={() => query && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search a college (e.g. Georgia, OSU, Oregon)"
            className="min-h-11 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded={open}
            aria-controls="team-search-listbox"
            aria-autocomplete="list"
          />
          {query && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Suggestions */}
        {open && suggestions.length > 0 && (
          <ul
            id="team-search-listbox"
            role="listbox"
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-xl"
          >
            {suggestions.map((t, i) => (
              <li key={t.name} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(t.name)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 px-3 text-left transition-colors",
                    i === active ? "bg-primary/10" : "hover:bg-primary/5",
                  )}
                >
                  <TeamLogo name={t.name} abbr={t.abbr} size="sm" />
                  <span className="font-display text-sm font-semibold text-foreground">{t.name}</span>
                  {(() => {
                    const rank = getTeamRank(t.name) ?? getTeamRank(t.abbr)
                    return rank != null ? (
                      <span className="ml-auto font-mono text-[11px] font-semibold text-primary">
                        #{rank}
                      </span>
                    ) : null
                  })()}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Results */}
      {selected && (
        <div className="mt-4">
          {loadingGames ? (
            <p className="rounded-lg border border-dashed border-border bg-background px-3 py-6 text-center text-sm text-muted-foreground">
              Loading games for {selected}…
            </p>
          ) : results.length > 0 ? (
            <>
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {results.length} scheduled {results.length === 1 ? "game" : "games"} for {selected}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {results.map((g) => {
                  const boardId = `cfbd-${g.id}`
                  const href = boardGameIds.has(boardId) ? `/game/${boardId}` : null
                  return <TeamGameCard key={g.id} g={g} team={selected} href={href} />
                })}
              </div>
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-background px-3 py-6 text-center text-sm text-muted-foreground">
              No scheduled games for {selected} this week.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function TeamGameCard({ g, team, href }: { g: CfbdGame; team: string; href: string | null }) {
  const isHome = g.homeTeam === team
  const opponent = isHome ? g.awayTeam : g.homeTeam

  const kickoff = new Date(g.startDate).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

  const meta = (
    <div className="flex items-center gap-4">
      <div className="font-mono text-[11px] text-muted-foreground">Week {g.week}</div>
      <div className="font-mono text-[11px] text-muted-foreground">{kickoff}</div>
      {g.venue && <div className="font-mono text-[11px] text-muted-foreground">{g.venue}</div>}
    </div>
  )

  const matchup = (
    <div className="flex items-center gap-2 font-display text-sm">
      <span className="font-mono text-[11px] uppercase text-muted-foreground">{isHome ? "vs" : "@"}</span>
      <TeamName name={opponent} abbr={opponent} size="sm" />
    </div>
  )

  // Only current-week games have an assembled breakdown to open. When one
  // exists, the whole card is a link into the breakdown; otherwise it stays a
  // static row with an explicit "upcoming" marker so the lack of a tap target
  // reads as intentional, not broken.
  if (href) {
    return (
      <Link
        href={href}
        className="group flex min-h-11 flex-col gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/50 hover:bg-primary/5 sm:flex-row sm:items-center sm:justify-between"
      >
        {matchup}
        <div className="flex items-center gap-3">
          {meta}
          <span className="flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-primary">
            <span className="hidden sm:inline">Breakdown</span>
            <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      {matchup}
      <div className="flex items-center gap-3">
        {meta}
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground/70">Upcoming</span>
      </div>
    </div>
  )
}
