import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"
import { sendEmail, emailLayout } from "@/lib/email"

// Load-bearing file. Shape copied from the Neon + Better Auth reference:
// - shared pg Pool (same connection as Drizzle)
// - baseURL cascade so the same code works in prod, Vercel previews, and the
//   v0 preview iframe
// - dev-only cross-site cookie attributes required by the v0 preview iframe
export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Password reset uses Better Auth's built-in secure token flow + its own
    // scrypt password hashing. We only supply delivery — no custom crypto.
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your BSE password",
        html: emailLayout({
          heading: "Reset your password",
          body: "We received a request to reset your Big Spread Energy password. This link expires in 1 hour. If you didn't request it, you can ignore this email.",
          ctaLabel: "Reset password",
          ctaUrl: url,
        }),
      })
    },
    // requireEmailVerification is intentionally OFF for now: we SEND the
    // verification email on signup but do not block login yet. Flip this to
    // true at launch once real delivery is confirmed (see launch checklist).
    requireEmailVerification: false,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your BSE email",
        html: emailLayout({
          heading: "Confirm your email",
          body: "Welcome to Big Spread Energy. Confirm this email address to secure your account.",
          ctaLabel: "Verify email",
          ctaUrl: url,
        }),
      })
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === "development"
      ? [
          "http://localhost:3000",
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(process.env.NODE_ENV === "production"
      ? [
          ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
            : []),
        ]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // In dev (v0 preview iframe), force cross-site cookies so the
          // session cookie is stored by the browser.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
})
