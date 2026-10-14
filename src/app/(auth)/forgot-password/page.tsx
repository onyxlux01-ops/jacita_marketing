"use client"

import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"

/**
 * Password recovery. The email link returns to /auth/callback in this same
 * browser (PKCE), which signs the person in and sends them to
 * /reset-password to choose a new password.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
      }
    )
    setLoading(false)
    // Same message whether or not the address has an account.
    if (resetError && !/rate limit/i.test(resetError.message)) {
      setError(resetError.message)
      return
    }
    if (resetError) {
      setError("Too many requests. Wait a minute and try again.")
      return
    }
    setSent(true)
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Password recovery
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Reset your password
        </h1>
        <p className="text-sm text-muted-foreground">
          We will email you a link to choose a new password.
        </p>
      </div>

      {sent ? (
        <div className="space-y-4 rounded-2xl border border-border/70 bg-background/80 p-6 text-sm">
          <p role="status">
            If an account exists for <span className="font-medium">{email}</span>,
            a reset link is on its way. Open it in this browser.
          </p>
          <Link href="/login" className="font-medium underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border border-border/70 bg-background/80 p-6 backdrop-blur-sm"
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10"
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-10 w-full" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </div>
  )
}
