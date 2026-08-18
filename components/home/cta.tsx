import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function HomeCta() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card px-6 py-14 text-center sm:px-12">
        <div
          className="absolute inset-0 grid-lines opacity-60"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-32 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[110px]"
          aria-hidden="true"
        />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-balance font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
            Stop chasing. Start pressing your edge.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
            Join thousands of bettors using BSE fair lines to attack every
            Saturday with a plan.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className={cn(
                buttonVariants({ variant: "default" }),
                "h-12 gap-2 px-7 font-display text-base font-semibold uppercase tracking-wide",
              )}
            >
              Create free account
              <ArrowUpRight className="size-5" />
            </Link>
            <Link
              href="/board"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-12 px-7 font-display text-base font-semibold uppercase tracking-wide",
              )}
            >
              Browse The Board
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
