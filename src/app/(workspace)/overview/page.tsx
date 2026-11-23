import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CapabilityReceipt } from "@/app/_components/capability-receipt";
import { InsightsPeriodForm } from "@/app/_components/insights-period-form";
import { WorkspaceRecovery } from "@/app/_components/workspace-recovery";
import { WorkspaceSelector } from "@/app/_components/workspace-selector";
import { readPreferences } from "@/lib/dashboard-preferences";
import { readSummary } from "@/lib/insights-gateway";
import { insightsPeriod, type InsightsPeriod } from "@/lib/insights-period";
import { readDetected, readUpcoming } from "@/lib/overview-recurring";
import { requireProfile } from "@/lib/require-profile";
import type { SearchParams } from "@/lib/view-filters";
import { readWorkspaceContext } from "@/lib/workspace-context";
import { canWriteWorkspace } from "@/lib/workspace-roles";
import { FinancialSummary } from "./financial-summary";
import { DetectedPreview, UpcomingPreview } from "./recurring";

export const metadata = { title: "Vista general" };
// A build without service config must not prerender a signed-out response.
export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: { searchParams?: Promise<SearchParams> } = {}) {
  const { guardado, suscripcion, ...input } = (await searchParams) ?? {};
  const period = insightsPeriod(input);
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
  const { accessToken, userId } = profile;
  const binding = { workspaceId: active.id, userId };
  const editor = canWriteWorkspace(active.role)
    ? { ...binding, period }
    : undefined;
  const preferencesRead = active.baseCurrency
    ? withDeadline((signal) => readPreferences(accessToken, active, signal))
    : Promise.resolve(null);
  const summary = preferencesRead.then(async (result) => {
    const preferences = typeof result === "object" ? result : null;
    const savedPeriod = input.from === undefined ? preferences?.period : null;
    const selected =
      savedPeriod?.preset === "custom"
        ? { from: savedPeriod.from, to: savedPeriod.to }
        : utcPresetPeriod(period, savedPeriod?.preset);
    const presetUnavailable = !!savedPeriod && savedPeriod.preset !== "custom";
    const summary = await withDeadline((signal) =>
      readSummary(
        accessToken,
        active,
        selected,
        signal,
        preferences?.presentationCurrency,
      ),
    );
    return { summary, period: selected, preferences, presetUnavailable };
  });
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
      <section aria-labelledby="overview-tools">
        <h2 id="overview-tools">Asistente y preferencias</h2>
        <ul>
          <li>
            <a href="/assistant">Asistente</a>
          </li>
          <li>
            <a href="/ai-credentials">Claves de IA</a>
          </li>
          <li>
            <a href="/notifications">Notificaciones</a>
          </li>
          <li>
            <a href="/cli/device">Autorizar dispositivo CLI</a>
          </li>
          <li>
            <a href="/mcp-grants">Permisos MCP</a>
          </li>
          <li>
            <a href="/members">Miembros del espacio</a>
          </li>
          <li>
            <a href="/sessions">Sesiones activas</a>
          </li>
          <li>
            <a href="/overview/preferences">Personalizar vista general</a>
          </li>
        </ul>
      </section>
      <Suspense fallback={<p role="status">Cargando resumen financiero…</p>}>
        <FinancialSummary report={summary} />
      </Suspense>
      <Suspense fallback={<p role="status">Cargando recurrencias…</p>}>
        <UpcomingPreview report={upcoming} />
      </Suspense>
      <Suspense fallback={<p role="status">Cargando suscripciones…</p>}>
        {guardado && <CapabilityReceipt requested={guardado} {...binding} />}
        {suscripcion === "resuelta" && (
          <p role="alert">La suscripción ya no está pendiente.</p>
        )}
        {suscripcion === "actualizada" && (
          <p role="alert">
            La suscripción cambió. Revisa los datos actualizados.
          </p>
        )}
        <DetectedPreview report={detected} editor={editor} />
      </Suspense>
    </>
  );
}

function utcPresetPeriod(
  period: InsightsPeriod,
  preset?: "this_month" | "this_quarter" | "this_year",
): InsightsPeriod {
  const { to } = period;
  const year = to.slice(0, 4);
  if (preset === "this_year") return { from: `${year}-01-01`, to };
  if (preset === "this_quarter") {
    const month = Number(to.slice(5, 7));
    const start = 1 + 3 * Math.floor((month - 1) / 3);
    return { from: `${year}-${String(start).padStart(2, "0")}-01`, to };
  }
  return period;
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
