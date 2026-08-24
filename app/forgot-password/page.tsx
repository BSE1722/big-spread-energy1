import type { Metadata } from "next"
import { AuthShell } from "@/components/auth/auth-shell"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata: Metadata = {
  title: "Forgot password | Big Spread Energy",
  description: "Reset your Big Spread Energy password.",
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot password" subtitle="We'll email you a secure reset link.">
      <ForgotPasswordForm />
    </AuthShell>
  )
}
