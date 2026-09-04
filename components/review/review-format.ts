export function fmtTicketNo(n: number): string {
  return `#${String(n).padStart(3, "0")}`
}

export function fmtSigned(n: number | null | undefined): string {
  if (n == null) return "—"
  const r = Math.round(n * 10) / 10
  return r > 0 ? `+${r}` : `${r}`
}

export function fmtPrice(n: number | null | undefined): string {
  if (n == null) return "—"
  return n > 0 ? `+${n}` : `${n}`
}

export function fmtPts(n: number | null | undefined): string {
  if (n == null) return "—"
  const r = Math.round(n * 10) / 10
  return `${r} pt${Math.abs(r) === 1 ? "" : "s"}`
}

export function gradeChipClass(grade: string): string {
  const base = "rounded px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide"
  if (grade === "win") return `${base} bg-primary/15 text-primary`
  if (grade === "loss") return `${base} bg-destructive/15 text-destructive`
  return `${base} border border-border text-muted-foreground`
}

export function fragilityChipClass(tier: string): string {
  const base = "rounded px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide"
  switch (tier) {
    case "EXTREME":
      return `${base} bg-destructive/20 text-destructive`
    case "HIGH":
      return `${base} bg-destructive/10 text-destructive`
    case "MODERATE":
      return `${base} bg-muted text-foreground`
    default:
      return `${base} border border-border text-muted-foreground`
  }
}

export function missKindLabel(kind: string): string {
  switch (kind) {
    case "model_miss":
      return "Model miss"
    case "variance":
      return "Variance-consistent"
    case "coin_flip":
      return "Near coin-flip"
    default:
      return "—"
  }
}
