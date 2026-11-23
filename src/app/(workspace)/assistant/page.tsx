import Link from "next/link";
import { saveCapability } from "@/app/_actions/capabilities";
import { CapabilityForm } from "@/app/_components/capability-form";
import { listFilters, nextPage, titled } from "@/lib/capability-lists";
import { dataAccess, dataId, dataObject } from "@/lib/data-access";
import { parsePage } from "@/lib/transactions-gateway";
import type { SearchParams } from "@/lib/view-filters";

export const dynamic = "force-dynamic";

export default async function Assistant({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const input = await searchParams;
  const filters = listFilters(input, {
    conversation: (value) => !!dataId(value),
  });
  const id = dataId(input.conversation);
  if (!filters || (input.conversation !== undefined && !id))
    return <p role="alert">Revisa la conversación y los filtros.</p>;
  filters.delete("conversation");
  const access = await dataAccess();
  if (!access) return <p role="alert">No hay un espacio activo disponible.</p>;
  const response = await access.request("agent/conversations", filters);
  const rows =
    response?.status === 200
      ? parsePage(await dataObject(response), titled)
      : null;
  const selected = rows?.items.find((row) => row.id === id);
  const more = nextPage("/assistant", filters, rows?.cursor);
  const scope = { workspaceId: access.workspace.id, userId: access.userId };
  const create = saveCapability.bind(null, { ...scope, kind: "conversation" });
  return (
    <>
      <h1>Asistente</h1>
      <p className="eyebrow">{access.workspace.name}</p>
      <Link href="/approvals" prefetch={false}>
        Propuestas pendientes
      </Link>
      <h2>Nueva conversación</h2>
      <CapabilityForm action={create} label="Crear conversación">
        <label className="field">
          Título (opcional)
          <input name="title" maxLength={120} />
        </label>
      </CapabilityForm>
      <h2>Conversaciones</h2>
      {!rows ? (
        <p role="alert">No pudimos cargar las conversaciones.</p>
      ) : !rows.items.length ? (
        <p>No hay conversaciones.</p>
      ) : (
        <ul>
          {rows.items.map((row) => {
            const selection = new URLSearchParams(filters);
            selection.set("conversation", row.id);
            return (
              <li key={row.id}>
                <a href={`/assistant?${selection}`}>{row.title}</a>
              </li>
            );
          })}
        </ul>
      )}
      {more && <a href={more}>Siguiente</a>}
      {selected ? (
        <section aria-label="Conversación activa">
          <h2>{selected.title}</h2>
          <CapabilityForm
            key={selected.id}
            action={saveCapability.bind(null, {
              ...scope,
              kind: "message",
              id: selected.id,
            })}
            label="Enviar mensaje"
          >
            <label className="field">
              Mensaje
              <textarea name="message" maxLength={20000} required />
            </label>
          </CapabilityForm>
        </section>
      ) : (
        id && <p role="alert">Conversación no disponible.</p>
      )}
    </>
  );
}
