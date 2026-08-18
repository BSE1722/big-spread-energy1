import type { Metadata } from "next"
import { AuthShell } from "@/components/auth/auth-shell"
import { AuthForm } from "@/components/auth/auth-form"

export const metadata: Metadata = {
  title: "Log in | Big Spread Energy",
  description: "Log in to your Big Spread Energy account.",
}

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" subtitle="Log in to hit the board.">
      <AuthForm mode="login" />
    </AuthShell>
  )
}
