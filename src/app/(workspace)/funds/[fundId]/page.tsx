import Link from "next/link";
import { notFound } from "next/navigation";
import { CapabilityReceipt } from "@/app/_components/capability-receipt";
import { fundId as validId, fundScope } from "@/lib/funds-gateway";
import { requireProfile } from "@/lib/require-profile";
import type { SearchParams } from "@/lib/view-filters";
import { canWriteWorkspace } from "@/lib/workspace-roles";
import { FundSummary } from "../summary";
import { FundControls } from "./controls";

export const dynamic = "force-dynamic";

export default async function FundPage({
  params,
  searchParams,
}: {
  params: Promise<{ fundId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { fundId } = await params;
  if (!validId(fundId)) notFound();
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const scope = await fundScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const fund = await scope.get(fundId.toLowerCase());
  if (fund === "not-found") notFound();
  if (fund === "service-error")
    return <p role="alert">No pudimos cargar el fondo.</p>;
  if (!fund) return <p role="alert">No pudimos encontrar el fondo</p>;
  const { guardado, actualizado } = (await searchParams) ?? {};
  const binding = { workspaceId: scope.workspaceId, userId: profile.userId };
  // Only the detail endpoint can supply the concurrency tag for edits.
  const writer = canWriteWorkspace(scope.role);
  const accounts = writer ? await scope.openAccounts() : null;
  return (
    <>
      <Link href="/funds">Volver a Fondos</Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>{fund.name}</h1>
      <FundSummary fund={fund} />
      {fund.objective && <p>{fund.objective}</p>}
      {guardado && <CapabilityReceipt requested={guardado} {...binding} />}
      {actualizado === "1" && (
        <p role="alert">El fondo cambió. Revisa los datos actualizados.</p>
      )}
      <Link href={`/funds/${fund.id}/contribute`} prefetch={false}>
        Registrar aporte
      </Link>
      {writer && (
        <FundControls fund={fund} accounts={accounts} binding={binding} />
      )}
    </>
  );
}
