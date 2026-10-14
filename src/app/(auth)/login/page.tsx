"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"

/** Only same-site paths ("/x", never "//host" or "/\host"). */
function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/app"
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? "/app"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    router.push(safeNext(next))
    router.refresh()
  }

  return (
    <>
      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-border/70 bg-background/80 p-6 shadow-[0_20px_60px_-40px_oklch(0.2_0_0_/_0.45)] backdrop-blur-sm"
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
            placeholder="you@studio.com"
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-10"
          />
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="h-10 w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="space-y-2 text-center text-sm text-muted-foreground">
        <p>
          <Link
            href="/forgot-password"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        </p>
        <p>Access is by invitation only. Ask your business owner for an invite.</p>
      </div>
    </>
  )
}

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Welcome back
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Sign in to Jacita
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage campaigns, content, and brand presence in one place.
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
