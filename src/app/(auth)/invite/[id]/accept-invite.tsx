"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

import { acceptInvite } from "@/app/(app)/app/actions/onboarding"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"

type SessionState =
  | { kind: "loading" }
  | { kind: "signed_out"; error?: string }
  | { kind: "signed_in"; email: string; newAccount: boolean }

/**
 * Landing page for invite emails. The email link signs the person in (the
 * tokens arrive in the URL fragment, which never reaches the server); they
 * then accept explicitly. The server (accept_invite) checks the invite is
 * theirs, pending and unexpired.
 */
export function AcceptInvite({ inviteId }: { inviteId: string }) {
  const router = useRouter()
  const [state, setState] = useState<SessionState>({ kind: "loading" })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    async function init() {
      const supabase = createClient()
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""))
      const accessToken = hash.get("access_token")
      const refreshToken = hash.get("refresh_token")
      const linkError = hash.get("error_description")
      const newAccount = hash.get("type") === "invite"
      if (window.location.hash) {
        // Drop the tokens from the address bar and history.
        window.history.replaceState(null, "", window.location.pathname)
      }
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (sessionError && !cancelled) {
          setState({ kind: "signed_out", error: sessionError.message })
          return
        }
      }
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      if (data.user?.email) {
        setState({ kind: "signed_in", email: data.user.email, newAccount })
      } else {
        setState({ kind: "signed_out", error: linkError ?? undefined })
      }
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [])

  function accept(newAccount: boolean) {
    setError(null)
    startTransition(async () => {
      const res = await acceptInvite(inviteId)
      if ("error" in res && res.error) {
        setError(res.error)
        return
      }
      router.push(newAccount ? "/reset-password?welcome=1" : "/app")
      router.refresh()
    })
  }

  async function switchAccount() {
    await createClient().auth.signOut()
    setState({ kind: "signed_out" })
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Invitation
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Join a business on Jacita
        </h1>
        <p className="text-sm text-muted-foreground">
          Jacita is a private workspace. You can only join by invitation.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-border/70 bg-background/80 p-6 backdrop-blur-sm">
        {state.kind === "loading" ? (
          <Skeleton className="h-24 w-full" />
        ) : state.kind === "signed_out" ? (
          <>
            {state.error ? (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Sign in with the email address the invite was sent to, then come
              back to this page to accept it. If the link in your email has
              expired, ask the business owner to resend it.
            </p>
            <Button asChild className="h-10 w-full">
              <Link href={`/login?next=${encodeURIComponent(`/invite/${inviteId}`)}`}>
                Sign in to accept
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm">
              Signed in as <span className="font-medium">{state.email}</span>.
            </p>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              className="h-10 w-full"
              disabled={pending}
              onClick={() => accept(state.newAccount)}
            >
              {pending ? "Joining…" : "Accept invite"}
            </Button>
            <button
              type="button"
              onClick={switchAccount}
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Not you? Use a different account
            </button>
          </>
        )}
      </div>
    </div>
  )
}
