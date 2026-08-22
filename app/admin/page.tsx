import type { Metadata } from "next"
import { AdminRefresh } from "@/components/admin/admin-refresh"

// Hidden route: not linked in nav and kept out of search indexes.
export const metadata: Metadata = {
  title: "Admin — Big Spread Energy",
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Admin</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground">DraftKings Lines</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Odds are frozen. The Board keeps showing the last saved snapshot until you run a manual
          refresh here. Nothing refreshes on page load, on a timer, or from visitor traffic.
        </p>
      </header>
      <AdminRefresh />
    </main>
  )
}
