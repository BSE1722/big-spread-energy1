"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

/**
 * Completes a password reset using the token from the email link. Better Auth
 * validates the token and re-hashes the new password with its own scrypt
 * implementation — no custom cryptography here.
 *
 * Wrapped in Suspense because it reads useSearchParams (token + error).
 */
export function ResetPasswordForm() {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get("token")
  const linkError = params.get("error")

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Better Auth appends ?error=INVALID_TOKEN when a link is bad/expired.
  if (linkError || !token) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          This reset link is invalid or has expired. Please request a new one.
        </p>
        <Link href="/forgot-password" className="text-center text-sm font-semibold text-primary hover:underline">
          Request a new link
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy || !token) return
    setError(null)

    const form = new FormData(e.currentTarget)
    const password = String(form.get("password") || "")
    const confirm = String(form.get("confirm") || "")
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }

    setBusy(true)
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token })
      if (error) {
        setError("We couldn't reset your password. The link may have expired — request a new one.")
        setBusy(false)
        return
      }
      setDone(true)
      setTimeout(() => router.push("/login"), 1500)
    } catch {
      setError("Something went wrong. Please try again.")
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-3 text-sm text-foreground">
        Password updated. Redirecting you to log in…
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-muted-foreground"
        >
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
          className="h-12 w-full rounded-lg border border-input bg-background px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
        />
      </div>
      <div>
        <label
          htmlFor="confirm"
          className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-muted-foreground"
        >
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
          className="h-12 w-full rounded-lg border border-input bg-background px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
        />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={busy}
        className="mt-2 h-12 w-full font-display text-base font-semibold uppercase tracking-wide"
      >
        {busy ? "Updating…" : "Update password"}
      </Button>
    </form>
  )
}
