import { Logo } from "@/components/logo"

const highlights = [
  "130+ fair lines projected every week",
  "Edge scores on every spread and total",
  "Grade any parlay before you place it",
]

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-stretch gap-0 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="absolute inset-0 grid-lines opacity-60" aria-hidden="true" />
        <div
          className="absolute -left-20 top-1/3 h-80 w-80 rounded-full bg-primary/15 blur-[110px]"
          aria-hidden="true"
        />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative">
          <p className="font-display text-4xl font-bold uppercase leading-tight tracking-tight text-foreground">
            Bet with an <span className="text-primary text-glow">edge</span>, not a hunch.
          </p>
          <ul className="mt-8 flex flex-col gap-3">
            {highlights.map((h) => (
              <li key={h} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {h}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          CFB Analytics Terminal
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  )
}
