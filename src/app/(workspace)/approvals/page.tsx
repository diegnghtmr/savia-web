import { approval, listFilters, nextPage } from "@/lib/capability-lists";
import { dataAccess, dataObject } from "@/lib/data-access";
import { parsePage } from "@/lib/transactions-gateway";
import type { SearchParams } from "@/lib/view-filters";

export const dynamic = "force-dynamic";

export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = listFilters(await searchParams);
  if (!filters) return <p role="alert">Revisa los filtros de propuestas.</p>;
  const access = await dataAccess();
  if (!access) return <p role="alert">No hay un espacio activo disponible.</p>;
  filters.set("status", "pending");
  const response = await access.request("approvals", filters);
  const rows =
    response?.status === 200
      ? parsePage(await dataObject(response), approval)
      : null;
  filters.delete("status");
  const pending = rows?.items.filter(({ status }) => status === "pending");
  const more = nextPage("/approvals", filters, rows?.cursor);
  return (
    <>
      <h1>Propuestas pendientes</h1>
      <p className="eyebrow">{access.workspace.name}</p>
      {!pending ? (
        <p role="alert">Bandeja de propuestas no disponible.</p>
      ) : !pending.length ? (
        <p>No tienes propuestas pendientes.</p>
      ) : (
        <ul>
          {pending.map(({ id, tool, risk }) => (
            <li key={id}>
              <a href={`/approvals/${id}`}>{tool}</a> · {risk}
            </li>
          ))}
        </ul>
      )}
      {more && <a href={more}>Siguiente</a>}
    </>
  );
}
