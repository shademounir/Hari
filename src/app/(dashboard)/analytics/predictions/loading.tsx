// Streaming skeleton for the predictions route — the most compute-heavy page in the
// app (company-wide risk scoring on first load). A loading.tsx gives an instant
// first paint via Suspense instead of blocking navigation on all the reads.
import { getTranslations } from "next-intl/server";

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className}`} />;
}

export default async function PredictionsLoading() {
  const t = await getTranslations("predictions");
  return (
    <div className="space-y-6 p-4 md:p-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
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
