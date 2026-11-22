import Link from "next/link";
import { notFound } from "next/navigation";
import { money } from "@/lib/account-money";
import {
  budgetScope,
  methods,
  percentUsed,
  rollover,
  validId,
} from "@/lib/budgets-gateway";
import { requireProfile } from "@/lib/require-profile";

export default async function BudgetPage({
  params,
}: {
  params: Promise<{ budgetId: string }>;
}) {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const { budgetId } = await params;
  if (!validId(budgetId)) notFound();
  const scope = await budgetScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const budget = await scope.detail(budgetId.toLowerCase());
  if (!budget) return <p role="alert">No pudimos cargar el presupuesto.</p>;
  const categories = budget.allocations.length
    ? await scope.categories()
    : null;
  return (
    <>
      <Link href="/budgets">Volver a Presupuestos</Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>{budget.name}</h1>
      <p>
        {budget.periodStart} – {budget.periodEnd} · {methods[budget.method]} ·{" "}
        {budget.currency}
      </p>
      {budget.etag === `"${budget.version}"` && (
        <p>
          <Link
            href={`/budgets/${budget.id}/edit/${budget.version}`}
            prefetch={false}
          >
            Editar presupuesto
          </Link>
        </p>
      )}
      <p>
        <Link href={`/budgets/new?copyFrom=${budget.id}`} prefetch={false}>
          Copiar a un nuevo presupuesto
        </Link>
      </p>
      <h2>Asignaciones por categoría</h2>
      {!budget.allocations.length ? (
        <p>Sin asignaciones.</p>
      ) : (
        <ul>
          {budget.allocations.map((row) => (
            <li key={row.categoryId}>
              <h3>
                {categories?.get(row.categoryId) ??
                  `Categoría ${row.categoryId}`}
              </h3>
              <dl>
                <dt>Planeado</dt>
                <dd>{money(row.planned)}</dd>
                <dt>Ejecutado</dt>
                <dd>{money(row.actual)}</dd>
                <dt>Disponible</dt>
                <dd>{money(row.available)}</dd>
                <dt>Utilizado</dt>
                <dd>
                  {percentUsed(row.actual.amountMinor, row.planned.amountMinor)}
                </dd>
                <dt>Arrastre</dt>
                <dd>
                  {rollover[row.policy]}
                  {row.target &&
                    `: ${categories?.get(row.target) ?? row.target}`}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
