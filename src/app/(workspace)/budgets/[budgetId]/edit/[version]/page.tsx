import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BudgetAllocations,
  BudgetMetadata,
} from "@/app/_components/budget-forms";
import { decimalForInput } from "@/lib/account-money";
import { budgetScope, methods, rollover, validId } from "@/lib/budgets-gateway";
import { requireProfile } from "@/lib/require-profile";

export default async function EditBudget({
  params,
}: {
  params: Promise<{ budgetId: string; version: string }>;
}) {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const { budgetId, version } = await params;
  if (!validId(budgetId) || !/^[1-9]\d{0,9}$/.test(version)) notFound();
  const scope = await budgetScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const budget = await scope.detail(budgetId.toLowerCase());
  if (!budget || budget.etag !== `"${budget.version}"`)
    return <p role="alert">No pudimos cargar la versión del presupuesto.</p>;
  if (Number(version) > budget.version) notFound();
  const categories = await scope.categories();
  // Preserve the original precondition on reload, including after an unobserved commit.
  const bound = {
    workspaceId: scope.workspaceId,
    id: budget.id,
    etag: `"${version}"`,
    currency: budget.currency,
  };
  return (
    <>
      <Link href={`/budgets/${budget.id}`} prefetch={false}>
        Volver al detalle
      </Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Editar presupuesto</h1>
      <p>
        {budget.periodStart} – {budget.periodEnd}
      </p>
      {Number(version) < budget.version && (
        <p>
          Si ya enviaste un cambio, puedes reintentar el mismo envío. Para otros
          cambios, vuelve al detalle.
        </p>
      )}
      <BudgetMetadata
        bound={bound}
        methods={Object.entries(methods)}
        name={budget.name}
        method={budget.method}
      />
      <h2>Asignaciones por categoría</h2>
      {!categories ? (
        <p role="alert">No pudimos cargar las categorías.</p>
      ) : (
        <BudgetAllocations
          bound={bound}
          categories={Array.from(categories)}
          policies={Object.entries(rollover).filter(
            ([key]) => key !== "to_fund",
          )}
          initial={budget.allocations.map(
            ({ categoryId, planned, policy, target }) => ({
              categoryId,
              planned: decimalForInput(planned),
              policy,
              target,
            }),
          )}
        />
      )}
    </>
  );
}
