import Link from "next/link";
import { budgetFilters, budgetScope, methods } from "@/lib/budgets-gateway";
import { requireProfile } from "@/lib/require-profile";
import type { SearchParams } from "@/lib/view-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Presupuestos" };

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const parsed = budgetFilters(await searchParams);
  if (!parsed) return <InvalidFilters />;
  const { filters, cursorWorkspace } = parsed;
  const scope = await budgetScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  if (cursorWorkspace && cursorWorkspace !== scope.workspaceId)
    return <InvalidFilters />;
  const page = await scope.list(filters);
  if (page === "invalid-filters") return <InvalidFilters />;
  const next = new URLSearchParams(filters);
  if (page?.cursor) next.set("cursor", page.cursor);
  return (
    <>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Presupuestos</h1>
      <Link className="call-to-action" href="/budgets/new" prefetch={false}>
        Nuevo presupuesto
      </Link>
      <form action="/budgets" method="get" aria-label="Filtrar presupuestos">
        {[
          ["from", "Desde"],
          ["to", "Hasta"],
        ].map(([id, label]) => (
          <div className="field" key={id}>
            <label htmlFor={id}>{label}</label>
            <input
              id={id}
              name={id}
              type="date"
              defaultValue={filters.get(id) ?? ""}
            />
          </div>
        ))}
        {filters.has("limit") && (
          <input type="hidden" name="limit" value={filters.get("limit")!} />
        )}
        <button className="submit" type="submit">
          Filtrar
        </button>
      </form>
      {!page ? (
        <p role="alert">No pudimos cargar los presupuestos.</p>
      ) : !page.items.length ? (
        <p>No hay presupuestos en esta página.</p>
      ) : (
        <ul>
          {page.items.map((budget) => (
            <li key={budget.id}>
              <h2>
                <Link href={`/budgets/${budget.id}`} prefetch={false}>
                  {budget.name}
                </Link>
              </h2>
              <p>
                {budget.periodStart} – {budget.periodEnd} ·{" "}
                {methods[budget.method]} · {budget.currency}
              </p>
            </li>
          ))}
        </ul>
      )}
      {page?.cursor && <Link href={`/budgets?${next}`}>Siguiente</Link>}
    </>
  );
}

function InvalidFilters() {
  return (
    <p role="alert">
      Revisa los filtros. <Link href="/budgets">Limpiar filtros</Link>
    </p>
  );
}
