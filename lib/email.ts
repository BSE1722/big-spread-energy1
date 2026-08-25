import "server-only"

import { Resend } from "resend"

/**
 * Provider-agnostic transactional email sender.
 *
 * Uses Resend when RESEND_API_KEY + EMAIL_FROM are configured. If they are not
 * set (e.g. a fresh preview), it falls back to logging the message server-side
 * so auth flows remain testable without silently pretending mail was delivered.
 *
 * Swapping providers later means changing only this file — callers just call
 * sendEmail().
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  if (!resend || !EMAIL_FROM) {
    // Fallback: never throw, but make it obvious delivery is not configured.
    console.log(
      `[v0] Email not sent (RESEND_API_KEY/EMAIL_FROM not configured). ` +
        `to=${to} subject=${JSON.stringify(subject)}`,
    )
    return
  }

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    text: text ?? stripHtml(html),
  })

  if (error) {
    // Surface a generic failure to the caller; log detail server-side only.
    console.log(`[v0] Resend send failed: ${JSON.stringify(error)}`)
    throw new Error("Failed to send email")
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Minimal branded wrapper so verification/reset emails look consistent. */
export function emailLayout(opts: { heading: string; body: string; ctaLabel: string; ctaUrl: string }): string {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #0a0a0a;">
    <h1 style="font-size: 20px; margin: 0 0 16px;">${opts.heading}</h1>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px; color: #404040;">${opts.body}</p>
    <a href="${opts.ctaUrl}" style="display: inline-block; background: #16a34a; color: #fff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 20px; border-radius: 8px;">${opts.ctaLabel}</a>
    <p style="font-size: 13px; line-height: 1.6; margin: 24px 0 0; color: #737373;">If the button doesn't work, copy and paste this link:<br/><span style="color:#16a34a; word-break: break-all;">${opts.ctaUrl}</span></p>
  </div>`
}
