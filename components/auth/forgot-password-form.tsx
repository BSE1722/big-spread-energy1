"use client"

import { useState } from "react"
import Link from "next/link"
import { forgetPassword } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

/**
 * Requests a password-reset email via Better Auth's built-in flow. We always
 * show the same success message regardless of whether the email exists, so we
 * never reveal which addresses are registered (enumeration protection).
 */
export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const email = String(new FormData(e.currentTarget).get("email") || "").trim()
    try {
      await forgetPassword({ email, redirectTo: "/reset-password" })
    } catch {
      // Swallow — we intentionally don't reveal failures/existence.
    }
    setSent(true)
    setBusy(false)
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-3 text-sm text-muted-foreground">
          If an account exists for that email, we&apos;ve sent a link to reset your password. The link expires in
          1 hour.
        </p>
        <Link href="/login" className="text-center text-sm font-semibold text-primary hover:underline">
          Back to log in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-muted-foreground"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="h-12 w-full rounded-lg border border-input bg-background px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
        />
      </div>
      <Button
        type="submit"
        disabled={busy}
        className="mt-2 h-12 w-full font-display text-base font-semibold uppercase tracking-wide"
      >
        {busy ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
        Back to log in
      </Link>
    </form>
  )
}
