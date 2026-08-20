"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, X, CalendarClock } from "lucide-react"
import { games, formatSpread, type Game } from "@/lib/data"
import { EdgeBadge } from "@/components/edge-badge"
import { TeamLogo } from "@/components/team-logo"
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
}

function gamesForTeam(team: string): Game[] {
  return games
    .filter((g) => g.away.name === team || g.home.name === team)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
}

export function TeamSearch() {
  const teams = useTeamOptions()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
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

  function choose(team: string) {
    setSelected(team)
    setQuery(team)
    setOpen(false)
    inputRef.current?.blur()
  }

  function clear() {
    setSelected(null)
    setQuery("")
    setOpen(false)
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

  const results = selected ? gamesForTeam(selected) : []

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
                  <span className="font-display text-sm font-semibold text-foreground">
                    {t.name}
                  </span>
                  {t.rank && (
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                      #{t.rank}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Results */}
      {selected && (
        <div className="mt-4">
          {results.length > 0 ? (
            <>
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {results.length} scheduled {results.length === 1 ? "game" : "games"} for {selected}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {results.map((g) => (
                  <TeamGameCard key={g.id} g={g} team={selected} />
                ))}
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

function TeamGameCard({ g, team }: { g: Game; team: string }) {
  const isHome = g.home.name === team
  const opponent = isHome ? g.away : g.home
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase text-muted-foreground">
          {isHome ? "vs" : "@"}
        </span>
        <TeamLogo name={opponent.name} abbr={opponent.abbr} size="sm" />
        <span className="font-display text-sm font-semibold text-foreground">
          {opponent.rank && <span className="text-muted-foreground">{opponent.rank} </span>}
          {opponent.name}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="font-mono text-[11px] text-muted-foreground">
          {g.kickoff}
          <span className="ml-1 opacity-60">· {g.network}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-[9px] uppercase text-muted-foreground">Market</div>
            <div className="font-mono text-xs text-foreground/80">{formatSpread(g.marketSpread)}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[9px] uppercase text-muted-foreground">BSE</div>
            <div className="font-mono text-xs font-semibold text-primary">
              {formatSpread(g.fairSpread)}
            </div>
          </div>
          <EdgeBadge edge={g.edgeSpread} />
        </div>
      </div>
    </div>
  )
}
