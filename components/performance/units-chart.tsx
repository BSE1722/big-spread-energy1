"use client"

/**
 * Lightweight cumulative-units chart. Pure inline SVG (no chart dependency) so
 * it stays fast and matches the site's minimal aesthetic. Renders a baseline at
 * zero units and a line that climbs/falls with the running total.
 */
export function UnitsChart({ points }: { points: Array<{ date: string; units: number }> }) {
  if (points.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        The units curve appears once at least two picks are graded.
      </div>
    )
  }

  const width = 640
  const height = 180
  const padX = 8
  const padY = 14

  const values = points.map((p) => p.units)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1

  const x = (i: number) => padX + (i / (points.length - 1)) * (width - padX * 2)
  const y = (v: number) => padY + (1 - (v - min) / span) * (height - padY * 2)

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.units).toFixed(1)}`).join(" ")
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${y(min).toFixed(1)} L ${x(0).toFixed(1)} ${y(min).toFixed(1)} Z`
  const zeroY = y(0)
  const last = points[points.length - 1].units
  const positive = last >= 0

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-44 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Cumulative units, currently ${last >= 0 ? "+" : ""}${last.toFixed(2)} units`}
    >
      <defs>
        <linearGradient id="unitsFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.86 0.24 148)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="oklch(0.86 0.24 148)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* zero baseline */}
      <line
        x1={padX}
        y1={zeroY}
        x2={width - padX}
        y2={zeroY}
        stroke="oklch(1 0 0 / 0.18)"
        strokeDasharray="4 4"
        strokeWidth="1"
      />
      <path d={area} fill="url(#unitsFill)" />
      <path
        d={line}
        fill="none"
        stroke={positive ? "oklch(0.86 0.24 148)" : "oklch(0.62 0.22 22)"}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
