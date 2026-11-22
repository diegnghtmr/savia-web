import Link from "next/link";
import { debtFilters, debtScope } from "@/lib/debts-gateway";
import { requireProfile } from "@/lib/require-profile";
import type { SearchParams } from "@/lib/view-filters";
import { DebtTerms } from "./terms";

function InvalidFilters() {
  return (
    <p role="alert">
      Revisa los filtros. <Link href="/debts">Limpiar filtros</Link>
    </p>
  );
}

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = debtFilters(await searchParams);
  if (!filters) return <InvalidFilters />;
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const scope = await debtScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  if (filters.workspace && filters.workspace !== scope.workspaceId)
    return <InvalidFilters />;
  const page = await scope.list(filters.query);
  if (page === "invalid-filters") return <InvalidFilters />;
  if (!page) return <p role="alert">No pudimos cargar las deudas.</p>;
  if (page.cursor) filters.query.set("cursor", page.cursor);
  return (
    <>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Deudas</h1>
      {page.items.length ? (
        <ul>
          {page.items.map((debt) => (
            <li key={debt.id}>
              <h2>
                <Link href={`/debts/${debt.id}`} prefetch={false}>
                  {debt.name}
                </Link>
              </h2>
              <DebtTerms debt={debt} />
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay deudas en esta página.</p>
      )}
      {page.cursor && (
        <Link href={`/debts?${filters.query}`} prefetch={false}>
          Siguiente
        </Link>
      )}
    </>
  );
}
