import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { InsightsPeriodForm } from "@/app/_components/insights-period-form";
import { WorkspaceRecovery } from "@/app/_components/workspace-recovery";
import { WorkspaceSelector } from "@/app/_components/workspace-selector";
import { readSummary } from "@/lib/insights-gateway";
import { insightsPeriod } from "@/lib/insights-period";
import { readDetected, readUpcoming } from "@/lib/overview-recurring";
import { requireProfile } from "@/lib/require-profile";
import type { SearchParams } from "@/lib/view-filters";
import { readWorkspaceContext } from "@/lib/workspace-context";
import { FinancialSummary } from "./financial-summary";
import { DetectedPreview, UpcomingPreview } from "./recurring";

export const metadata = { title: "Vista general" };
// A build without service config must not prerender a signed-out response.
export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: { searchParams?: Promise<SearchParams> } = {}) {
  const period = insightsPeriod((await searchParams) ?? {});
  if (!period) {
    return (
      <>
        <h1>Vista general</h1>
        <p role="alert">Revisa el período.</p>
        <InsightsPeriodForm />
      </>
    );
  }
  const profile = await requireProfile();
  if (profile.kind === "failed") {
    return (
      <Retry
        title="No pudimos cargar Savia"
        message="No pudimos consultar tu perfil. Vuelve a intentarlo en un momento."
      />
    );
  }
  const result = await readWorkspaceContext(profile.accessToken);
  if (result.kind === "unauthenticated") redirect("/sign-in");
  if (result.kind === "failed") {
    return (
      <Retry title="Vista general" message="No pudimos cargar tus espacios." />
    );
  }
  const { active, items } = result;
  if (!active) {
    return (
      <>
        <h1>Vista general</h1>
        <p className="lead">No tienes espacios disponibles.</p>
        <WorkspaceRecovery nonce={randomUUID()} />
      </>
    );
  }
  const { accessToken } = profile;
  const summary = withDeadline((signal) =>
    readSummary(accessToken, active, period, signal),
  );
  const upcoming = withDeadline((signal) =>
    readUpcoming(accessToken, active, signal),
  );
  const detected = withDeadline((signal) =>
    readDetected(accessToken, active, signal),
  );
  return (
    <>
      <p className="eyebrow">Vista general</p>
      <h1 style={{ overflowWrap: "anywhere" }}>{active.name}</h1>
      <WorkspaceSelector key={active.id} items={items} active={active.id} />
      <InsightsPeriodForm period={period} />
      <Suspense fallback={<p role="status">Cargando resumen financiero…</p>}>
        <FinancialSummary report={summary} />
      </Suspense>
      <Suspense fallback={<p role="status">Cargando recurrencias…</p>}>
        <UpcomingPreview report={upcoming} />
      </Suspense>
      <Suspense fallback={<p role="status">Cargando suscripciones…</p>}>
        <DetectedPreview report={detected} />
      </Suspense>
    </>
  );
}

async function withDeadline<T>(read: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const { promise, resolve } = Promise.withResolvers<null>();
  const timer = setTimeout(() => {
    resolve(null);
    controller.abort();
  }, 5000);
  try {
    return await Promise.race([read(controller.signal), promise]);
  } finally {
    clearTimeout(timer);
  }
}

function Retry({ title, message }: { title: string; message: string }) {
  return (
    <>
      <h1>{title}</h1>
      <p className="lead">{message}</p>
      <form action="/overview" method="get">
        <button className="submit" type="submit">
          Volver a intentar
        </button>
      </form>
    </>
  );
}
