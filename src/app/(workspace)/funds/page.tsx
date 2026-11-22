import Link from "next/link";
import { fundFilters, fundScope } from "@/lib/funds-gateway";
import { requireProfile } from "@/lib/require-profile";
import type { SearchParams } from "@/lib/view-filters";
import { FundSummary } from "./summary";

function InvalidFilters() {
  return (
    <p role="alert">
      Revisa los filtros. <Link href="/funds">Limpiar filtros</Link>
    </p>
  );
}

export default async function FundsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = fundFilters(await searchParams);
  if (!query) return <InvalidFilters />;
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const scope = await fundScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  if (query.workspace && query.workspace !== scope.workspaceId)
    return <InvalidFilters />;
  const page = await scope.list(query.filters);
  if (page === "invalid-filters") return <InvalidFilters />;
  if (!page) return <p role="alert">No pudimos cargar los fondos.</p>;
  if (page.cursor) query.filters.set("cursor", page.cursor);
  return (
    <>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Fondos</h1>
      <Link href="/funds/new" prefetch={false}>
        Nuevo fondo
      </Link>
      {page.items.length ? (
        <ul>
          {page.items.map((fund) => (
            <li key={fund.id}>
              <h2>
                <Link href={`/funds/${fund.id}`} prefetch={false}>
                  {fund.name}
                </Link>
              </h2>
              <FundSummary fund={fund} />
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay fondos en esta página.</p>
      )}
      {page.cursor && (
        <Link href={`/funds?${query.filters}`} prefetch={false}>
          Siguiente
        </Link>
      )}
    </>
  );
}
