import { cn } from "@/lib/utils"

export function SectionEyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-primary", className)}>
      <span className="h-px w-8 bg-primary" aria-hidden="true" />
      {children}
    </p>
  )
}

export function DemoTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-muted-foreground/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground",
        className,
      )}
    >
      Demo
    </span>
  )
}
