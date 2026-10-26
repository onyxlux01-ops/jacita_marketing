import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import shell from "@/components/auth/auth-shell.module.css";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to manage your JACITA marketing workspace.",
};

export default function LoginPage() {
  return (
    <AuthShell>
      <p className={shell.eyebrow}>Your marketing workspace</p>
      <h1 className={shell.title}>
        Welcome back
        <br />
        <em>to JACITA.</em>
      </h1>
      <p className={shell.lead}>
        Sign in to manage your campaigns, content, and social channels.
      </p>
      <div className="mt-8 w-full max-w-sm space-y-5 text-left">
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
          <LoginForm />
        </Suspense>
      </div>
      <Link href="/" className={shell.back}>
        Back to JACITA Marketing
      </Link>
    </AuthShell>
  );
}
