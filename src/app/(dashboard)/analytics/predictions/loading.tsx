// Streaming skeleton for the predictions route — the most compute-heavy page in the
// app (company-wide risk scoring on first load). A loading.tsx gives an instant
// first paint via Suspense instead of blocking navigation on all the reads.
function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className}`} />;
}

export default function PredictionsLoading() {
  return (
    <div className="space-y-6 p-4 md:p-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading predictions…</span>
      <div className="grid gap-4 sm:grid-cols-3">
        <Block className="h-28" />
        <Block className="h-28" />
        <Block className="h-28" />
      </div>
      <Block className="h-72" />
      <Block className="h-72" />
      <Block className="h-56" />
    </div>
  );
}
