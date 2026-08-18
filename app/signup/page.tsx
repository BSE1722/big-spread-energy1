import type { Metadata } from "next"
import { AuthShell } from "@/components/auth/auth-shell"
import { AuthForm } from "@/components/auth/auth-form"

export const metadata: Metadata = {
  title: "Sign up | Big Spread Energy",
  description: "Create your free Big Spread Energy account.",
}

export default function SignupPage() {
  return (
    <AuthShell title="Create your account" subtitle="Start free. Upgrade to Pro anytime.">
      <AuthForm mode="signup" />
    </AuthShell>
  )
}
