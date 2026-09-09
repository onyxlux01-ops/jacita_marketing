import Link from "next/link"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-[radial-gradient(ellipse_at_top,_oklch(0.97_0.01_250)_0%,_oklch(0.99_0.005_90)_45%,_oklch(0.96_0.01_200)_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(0.9_0_0_/_0.35)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.9_0_0_/_0.35)_1px,transparent_1px)] bg-size-[48px_48px] mask-[radial-gradient(ellipse_at_center,black,transparent_75%)]" />

      <header className="relative z-10 px-6 py-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Jacita
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}
