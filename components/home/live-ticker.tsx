"use client"

import { useLiveBoard, formatKickoff, formatKickoffDate, type LiveBoardGame } from "@/lib/use-live-board"
import { toHomeSignal, formatFavoredHomeRel } from "@/lib/home-signals"
import { LiveDot } from "@/components/home/bse-alert"

/**
 * Broadcast / trading-terminal ticker. Each game contributes only the tokens it
 * actually has data for: kickoff + matchup always; BSE EDGE and RATING only when
 * the frozen model has produced them; MARKET|BSE only when both lines exist. It
 * never fabricates line movement or weather — those tokens simply don't appear
 * because the board feed doesn't carry that data.
 */

interface Token {
  key: string
  label: string
  value: string
  accent?: boolean
}

function tokensForGame(g: LiveBoardGame): Token[] {
  const out: Token[] = []
  const matchup = `${g.away.abbr} @ ${g.home.abbr}`

  out.push({ key: `${g.id}-kick`, label: matchup, value: `${formatKickoffDate(g.kickoff)} ${formatKickoff(g.kickoff, g.kickoffTBD)}` })

  const sig = toHomeSignal(g)
  if (sig) {
    const market = formatFavoredHomeRel(sig.marketSpread, g.home, g.away)
    const fair = formatFavoredHomeRel(sig.fairSpread, g.home, g.away)
    out.push({
      key: `${g.id}-lines`,
      label: `${g.away.abbr}/${g.home.abbr}`,
      value: `MKT ${market.abbr} ${market.line} | BSE ${fair.abbr} ${fair.line}`,
    })
    if (sig.disagrees) {
      out.push({ key: `${g.id}-edge`, label: "BSE Edge", value: `+${sig.absGap.toFixed(1)}`, accent: true })
    }
  }

  if (g.bseRating != null) {
    out.push({ key: `${g.id}-rating`, label: "Rating", value: String(g.bseRating), accent: g.bseRating >= 80 })
  }

  return out
}

export function LiveTicker() {
  const { games, week, loading, error } = useLiveBoard()

  const tokens = games.flatMap(tokensForGame)
  // Duplicate for a seamless loop.
  const items = tokens.length ? [...tokens, ...tokens] : []
  const durationSeconds = Math.max(60, tokens.length * 3.5)

  return (
    <div className="group flex w-full items-stretch overflow-hidden border-y border-border bg-card">
      {/* Fixed LIVE tag */}
      <div className="z-10 flex shrink-0 items-center gap-2 border-r border-border bg-primary/10 px-3 py-2.5 sm:px-4">
        <LiveDot />
        <span className="font-display text-[0.625rem] font-bold uppercase tracking-widest text-primary sm:text-xs">
          BSE Live
        </span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {items.length > 0 ? (
          <div
            className="animate-[ticker_linear_infinite] flex w-max items-center gap-6 py-2.5 group-hover:[animation-play-state:paused]"
            style={{ animationDuration: `${durationSeconds}s` }}
          >
            {items.map((t, i) => (
              <div key={`${t.key}-${i}`} className="flex items-center gap-2 whitespace-nowrap px-1 font-mono text-xs">
                <span className="font-semibold uppercase tracking-wide text-muted-foreground">{t.label}</span>
                <span className={t.accent ? "font-bold text-primary" : "text-foreground"}>{t.value}</span>
                <span aria-hidden className="text-border">|</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center py-2.5 pl-4 font-mono text-xs text-muted-foreground">
            {loading
              ? "Loading live signals…"
              : error
                ? "Live schedule unavailable"
                : `Week ${week ?? ""} schedule loading…`}
          </div>
        )}
      </div>
    </div>
  )
}
