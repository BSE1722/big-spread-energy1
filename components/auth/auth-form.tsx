"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn, signUp } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

/**
 * Real email + password authentication via Better Auth. Sign-in/sign-up are
 * called from this client event handler (per Better Auth guidance). On success
 * we send the user to `?next=` (defaulting to the Board). Errors are shown
 * generically — we never reveal whether an email is registered.
 *
 * Wrapped in Suspense because it reads `useSearchParams` (the `next` redirect).
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <AuthFormInner mode={mode} />
    </Suspense>
  )
}

function AuthFormInner({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup"
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextParam = searchParams.get("next")
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/board"

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)

    const form = new FormData(e.currentTarget)
    const email = String(form.get("email") || "").trim()
    const password = String(form.get("password") || "")
    const name = String(form.get("name") || "").trim()

    try {
      if (isSignup) {
        const { error } = await signUp.email({ email, password, name })
        if (error) {
          setError("We couldn't create your account. Please check your details and try again.")
          setBusy(false)
          return
        }
      } else {
        const { error } = await signIn.email({ email, password })
        if (error) {
          setError("Incorrect email or password.")
          setBusy(false)
          return
        }
      }
      router.push(next)
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {isSignup && (
        <Field label="Full name" htmlFor="name">
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            placeholder="Nick Saban"
            className="h-12 w-full rounded-lg border border-input bg-background px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
          />
        </Field>
      )}

      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="h-12 w-full rounded-lg border border-input bg-background px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={8}
          placeholder="••••••••"
          className="h-12 w-full rounded-lg border border-input bg-background px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
        />
        {!isSignup && (
          <div className="mt-1.5 text-right">
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
        )}
      </Field>

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
        {busy ? (isSignup ? "Creating account…" : "Logging in…") : isSignup ? "Create account" : "Log in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isSignup ? "Already have an account?" : "New to BSE?"}{" "}
        <Link
          href={isSignup ? `/login${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""}` : `/signup${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""}`}
          className="font-semibold text-primary hover:underline"
        >
          {isSignup ? "Log in" : "Create an account"}
        </Link>
      </p>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={htmlFor} className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </label>
      </div>
      {children}
    </div>
  )
}
