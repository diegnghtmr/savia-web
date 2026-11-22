import Link from "next/link";
import { notFound } from "next/navigation";
import { BudgetMetadata } from "@/app/_components/budget-forms";
import { budgetScope, methods, validId } from "@/lib/budgets-gateway";
import { requireProfile } from "@/lib/require-profile";
import type { SearchParams } from "@/lib/view-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo presupuesto" };

export default async function NewBudget({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const { copyFrom } = await searchParams;
  if (copyFrom !== undefined && !validId(copyFrom)) notFound();
  const scope = await budgetScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const copy = copyFrom ? await scope.detail(copyFrom.toLowerCase()) : null;
  if (copyFrom && !copy)
    return <p role="alert">No pudimos cargar el presupuesto de origen.</p>;
  const date = new Date();
  const start = `${date.toISOString().slice(0, 7)}-01`;
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);
  return (
    <>
      <Link href="/budgets">Volver a Presupuestos</Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Nuevo presupuesto</h1>
      <BudgetMetadata
        bound={{ workspaceId: scope.workspaceId }}
        methods={Object.entries(methods)}
        method={copy?.method}
        period={[start, end]}
        copy={copy ?? undefined}
      />
    </>
  );
}
