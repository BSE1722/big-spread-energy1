"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup"
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
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

      <Field
        label="Password"
        htmlFor="password"
        action={
          !isSignup ? (
            <Link href="/login" className="font-mono text-[11px] uppercase tracking-wide text-primary hover:underline">
              Forgot?
            </Link>
          ) : undefined
        }
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          placeholder="••••••••"
          className="h-12 w-full rounded-lg border border-input bg-background px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
        />
      </Field>

      {submitted && (
        <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-primary">
          Demo only — connect an auth provider to {isSignup ? "create accounts" : "sign in"}.
        </p>
      )}

      <Button
        type="submit"
        className="mt-2 h-12 w-full font-display text-base font-semibold uppercase tracking-wide"
      >
        {isSignup ? "Create account" : "Log in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isSignup ? "Already have an account?" : "New to BSE?"}{" "}
        <Link
          href={isSignup ? "/login" : "/signup"}
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
  action,
  children,
}: {
  label: string
  htmlFor: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={htmlFor} className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </label>
        {action}
      </div>
      {children}
    </div>
  )
}
