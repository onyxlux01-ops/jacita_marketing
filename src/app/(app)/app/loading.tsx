export default function WorkspaceLoading() {
  return (
    <div
      role="status"
      aria-label="Loading workspace"
      className="jacita-page animate-pulse"
    >
      <div className="h-9 w-60 rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="glass-panel h-32" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="glass-panel h-96" />
        <div className="glass-panel h-96" />
      </div>
      <span className="sr-only">Loading business records…</span>
    </div>
  );
}
