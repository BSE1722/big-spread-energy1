"use client"

import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Wand2, SlidersHorizontal } from "lucide-react"
import { ParlayGenerator } from "@/components/parlay/parlay-generator"
import { ParlayAnalyzer } from "@/components/parlay/parlay-analyzer"
import { cn } from "@/lib/utils"

type TabId = "generate" | "analyze"

const TABS: { id: TabId; label: string; hint: string; icon: typeof Wand2 }[] = [
  { id: "generate", label: "Generate", hint: "BSE builds the ticket", icon: Wand2 },
  { id: "analyze", label: "Analyze", hint: "Grade your own legs", icon: SlidersHorizontal },
]

/**
 * Hosts both parlay tools under one route as sub-tabs. The active tab is driven
 * by the `?tab=` query param so Getting Parlaid's "Analyze an alternate" CTA
 * (which links with ?tab=analyze&game=&side=) lands directly on the analyzer
 * with its leg preselected. Only the active tool is mounted, so switching to
 * Analyze remounts it and re-reads the deep-link params.
 */
export function ParlayTools() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab: TabId = searchParams.get("tab") === "analyze" ? "analyze" : "generate"

  const selectTab = useCallback(
    (next: TabId) => {
      if (next === tab) return
      // Manual switches carry no leg preselection; drop game/side so they don't
      // silently reseed the analyzer. The CTA sets them via its own href.
      const qs = next === "analyze" ? "?tab=analyze" : ""
      router.replace(`/getting-parlaid${qs}`, { scroll: false })
    },
    [router, tab],
  )

  return (
    <div>
      <div
        role="tablist"
        aria-label="Parlay tools"
        className="mb-8 inline-flex w-full max-w-md gap-1 rounded-xl border border-border bg-card p-1 sm:w-auto"
      >
        {TABS.map(({ id, label, hint, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-left transition-colors sm:flex-none",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex flex-col leading-tight">
                <span className="font-display text-sm font-semibold uppercase tracking-wide">{label}</span>
                <span
                  className={cn(
                    "text-[11px]",
                    active ? "text-primary-foreground/80" : "text-muted-foreground/70",
                  )}
                >
                  {hint}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {tab === "generate" ? <ParlayGenerator /> : <ParlayAnalyzer />}
    </div>
  )
}
