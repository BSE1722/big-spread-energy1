import Image from "next/image"
import { getTeamBranding } from "@/lib/bse"
import { cn } from "@/lib/utils"

const SIZES = {
  sm: { box: "h-6 w-6", text: "text-[9px]", px: 24 },
  md: { box: "h-8 w-8", text: "text-[10px]", px: 32 },
  lg: { box: "h-10 w-10", text: "text-xs", px: 40 },
} as const

type Size = keyof typeof SIZES

/**
 * Team logo chip. Renders the school's real logo image when a `logo` URL is
 * present in the branding map; otherwise falls back to a legally-safe monogram
 * badge in the team's primary color. Decorative — the visible team name label
 * carries the accessible text, so this is marked aria-hidden.
 */
export function TeamLogo({
  name,
  abbr,
  size = "md",
  className,
}: {
  name: string
  abbr: string
  size?: Size
  className?: string
}) {
  const branding = getTeamBranding(name)
  const s = SIZES[size]

  if (branding.logo) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border",
          s.box,
          className,
        )}
      >
        <Image src={branding.logo || "/placeholder.svg"} alt="" width={s.px} height={s.px} className="h-full w-full object-contain" />
      </span>
    )
  }

  return (
    <span
      aria-hidden
      style={{ backgroundColor: branding.color }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold uppercase leading-none text-white ring-1 ring-white/15",
        s.box,
        s.text,
        className,
      )}
    >
      {abbr}
    </span>
  )
}
