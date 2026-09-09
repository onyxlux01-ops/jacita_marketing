export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border/80 bg-card/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
          <span className="font-heading text-lg font-semibold tracking-tight">
            Jacita Platform
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
