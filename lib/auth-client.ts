"use client"

import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient

// forgetPassword / resetPassword / sendVerificationEmail exist on the runtime
// proxy client but are not on the static type surface, so call them directly
// off `authClient` in components rather than destructuring them here.
