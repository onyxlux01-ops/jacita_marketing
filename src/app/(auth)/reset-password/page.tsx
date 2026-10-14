"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"

/**
 * Choose a new password. Reached signed in: from a recovery link (via
 * /auth/callback) or right after accepting an invite (?welcome=1).
 */
function ResetPasswordForm() {
  const router = useRouter()
  const welcome = useSearchParams().get("welcome") === "1"
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setSignedIn(Boolean(data.user))
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("Use at least 8 characters")
      return
    }
    if (password !== confirm) {
      setError("The passwords do not match")
      return
    }
    setLoading(true)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    router.push("/app")
    router.refresh()
  }

  if (signedIn === null) return <Skeleton className="h-64 w-full rounded-2xl" />
  if (!signedIn) {
    return (
      <div className="space-y-4 rounded-2xl border border-border/70 bg-background/80 p-6 text-sm">
        <p>This reset link has expired or was opened in a different browser.</p>
        <Link href="/forgot-password" className="font-medium underline-offset-4 hover:underline">
          Send a new link
        </Link>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-2xl border border-border/70 bg-background/80 p-6 backdrop-blur-sm"
    >
      {welcome ? (
        <p className="text-sm text-muted-foreground">
          You have joined the business. Set a password so you can sign in next time.
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="h-10"
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="h-10 w-full" disabled={loading}>
        {loading ? "Saving…" : "Save password"}
      </Button>
      {welcome ? (
        <p className="text-center text-sm">
          <Link href="/app" className="text-muted-foreground underline-offset-4 hover:underline">
            Skip for now
          </Link>
        </p>
      ) : null}
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Choose a new password
        </h1>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
