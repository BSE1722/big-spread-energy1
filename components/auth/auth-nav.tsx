"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, Crown, LogOut, User } from "lucide-react"
import { signOut } from "@/lib/auth-client"
import { useAccess } from "@/lib/use-access"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Header auth surface. Renders the current session state from /api/access:
 *  - guest → Log In + Join BSE Pro
 *  - authenticated → account dropdown with tier badge + sign out
 *
 * `variant="mobile"` renders a flat, non-dropdown version for the mobile menu.
 */
export function AuthNav({
  variant = "desktop",
  onNavigate,
}: {
  variant?: "desktop" | "mobile"
  onNavigate?: () => void
}) {
  const router = useRouter()
  const { access, isPro, isGuest, loading, refresh } = useAccess()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  async function handleSignOut() {
    await signOut()
    setOpen(false)
    onNavigate?.()
    await refresh()
    router.push("/")
    router.refresh()
  }

  // While loading, reserve space so the header doesn't jump.
  if (loading && !access) {
    return <div className={variant === "desktop" ? "h-10 w-40 animate-pulse rounded-md bg-secondary/50" : "h-11"} />
  }

  // Guest
  if (isGuest || !access) {
    if (variant === "mobile") {
      return (
        <>
          <Link
            href="/login"
            onClick={onNavigate}
            className={cn(buttonVariants({ variant: "outline" }), "h-11 font-display font-semibold uppercase tracking-wide")}
          >
            Log In
          </Link>
          <Link
            href="/signup"
            onClick={onNavigate}
            className={cn(buttonVariants({ variant: "default" }), "h-11 font-display font-semibold uppercase tracking-wide")}
          >
            Join BSE Pro
          </Link>
        </>
      )
    }
    return (
      <>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline" }), "h-10 px-5 font-display font-semibold uppercase tracking-wide")}
        >
          Log In
        </Link>
        <Link
          href="/signup"
          className={cn(buttonVariants({ variant: "default" }), "h-10 px-5 font-display font-semibold uppercase tracking-wide")}
        >
          Join BSE Pro
        </Link>
      </>
    )
  }

  const displayName = access.userName || access.userEmail || "Account"
  const tierLabel = isPro ? "BSE Pro" : "Rookie"

  // Mobile: flat list
  if (variant === "mobile") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-1 py-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-secondary">
            <User className="size-4 text-foreground" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-foreground">{displayName}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-primary">{tierLabel}</p>
          </div>
        </div>
        {!isPro && (
          <Link
            href="/pricing"
            onClick={onNavigate}
            className={cn(buttonVariants({ variant: "default" }), "h-11 font-display font-semibold uppercase tracking-wide")}
          >
            <Crown className="size-4" /> Go Pro
          </Link>
        )}
        <Link
          href="/account"
          onClick={onNavigate}
          className={cn(buttonVariants({ variant: "outline" }), "h-11 font-display font-semibold uppercase tracking-wide")}
        >
          <User className="size-4" /> Account &amp; Billing
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className={cn(buttonVariants({ variant: "outline" }), "h-11 font-display font-semibold uppercase tracking-wide")}
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    )
  }

  // Desktop: dropdown
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 font-display text-sm font-semibold text-foreground transition-colors hover:border-border/70"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-secondary">
          <User className="size-3.5" />
        </span>
        <span className="max-w-32 truncate">{displayName}</span>
        {isPro && <Crown className="size-3.5 text-primary" />}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate font-display text-sm font-semibold text-foreground">{displayName}</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">{tierLabel}</p>
          </div>
          <div className="flex flex-col p-1.5">
            <MenuLink href="/board" onClick={() => setOpen(false)}>
              The Board
            </MenuLink>
            <MenuLink href="/account" onClick={() => setOpen(false)}>
              <User className="size-4 text-muted-foreground" />
              Account &amp; Billing
            </MenuLink>
            {!isPro && (
              <MenuLink href="/pricing" onClick={() => setOpen(false)}>
                <Crown className="size-4 text-primary" />
                Upgrade to Pro
              </MenuLink>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex min-h-10 items-center gap-2 rounded-md px-3 text-left font-display text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <LogOut className="size-4 text-muted-foreground" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex min-h-10 items-center gap-2 rounded-md px-3 font-display text-sm font-medium text-foreground transition-colors hover:bg-secondary"
    >
      {children}
    </Link>
  )
}
