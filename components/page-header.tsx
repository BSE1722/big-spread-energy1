export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 grid-lines opacity-60" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          {eyebrow}
        </span>
        <h1 className="mt-3 text-balance font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        {description && (
          <p className="mt-4 max-w-2xl text-pretty text-muted-foreground">
            {description}
          </p>
        )}
        {children}
      </div>
    </section>
  )
}
