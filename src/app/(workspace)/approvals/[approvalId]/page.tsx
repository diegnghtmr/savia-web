import Link from "next/link";
import { notFound } from "next/navigation";
import { saveCapability } from "@/app/_actions/capabilities";
import { CapabilityForm } from "@/app/_components/capability-form";
import { approval } from "@/lib/capability-lists";
import { dataAccess, dataId, dataObject } from "@/lib/data-access";
import type { SearchParams } from "@/lib/view-filters";

export const dynamic = "force-dynamic";

export default async function ApprovalDetail({
  params,
  searchParams,
}: {
  params: Promise<{ approvalId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const id = dataId((await params).approvalId);
  if (!id) notFound();
  const stale = (await searchParams).actualizada === "1";
  const access = await dataAccess();
  if (!access) return <p role="alert">No hay un espacio activo disponible.</p>;
  const response = await access.request(`approvals/${id}`);
  if (response?.status === 404 || response?.status === 403) notFound();
  const row =
    response?.status === 200 ? approval(await dataObject(response)) : null;
  if (!row || row.id !== id)
    return <p role="alert">No pudimos verificar la propuesta.</p>;
  const scope = {
    id,
    workspaceId: access.workspace.id,
    userId: access.userId,
    argumentsHash: row.hash,
  };
  const confirm = saveCapability.bind(null, { ...scope, kind: "confirm" });
  const reject = saveCapability.bind(null, { ...scope, kind: "reject" });
  return (
    <>
      <Link href="/approvals" prefetch={false}>
        Volver a propuestas
      </Link>
      <h1>Revisar propuesta</h1>
      {stale && (
        <p role="alert">La propuesta cambió. Revisa los datos actualizados.</p>
      )}
      <dl>
        <dt>Acción</dt>
        <dd>{row.tool}</dd>
        <dt>Riesgo</dt>
        <dd>{row.risk}</dd>
        <dt>Estado</dt>
        <dd>{row.status}</dd>
        <dt>Vence</dt>
        <dd>{row.expires}</dd>
      </dl>
      <h2>Datos de la propuesta</h2>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {JSON.stringify(row.preview, null, 2)}
      </pre>
      {row.status === "pending" && row.preview && (
        <>
          <CapabilityForm action={confirm} label="Aprobar propuesta" />
          <CapabilityForm action={reject} label="Rechazar propuesta" />
        </>
      )}
    </>
  );
}
