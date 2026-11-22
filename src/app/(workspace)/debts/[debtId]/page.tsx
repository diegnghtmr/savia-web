import Link from "next/link";
import { notFound } from "next/navigation";
import { debtId as validId, debtScope } from "@/lib/debts-gateway";
import { requireProfile } from "@/lib/require-profile";
import { DebtTerms } from "../terms";
import { debtProjection } from "../projection";

export default async function DebtPage({
  params,
}: {
  params: Promise<{ debtId: string }>;
}) {
  const { debtId } = await params;
  if (!validId(debtId)) notFound();
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const scope = await debtScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const debt = await scope.detail(debtId.toLowerCase());
  if (debt === "not-found") notFound();
  if (!debt) return <p role="alert">No pudimos cargar la deuda.</p>;
  return (
    <>
      <Link href="/debts">Volver a Deudas</Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>{debt.name}</h1>
      <DebtTerms debt={debt} detail />
      <Link href={`/debts/${debt.id}/pay`} prefetch={false}>
        Registrar pago
      </Link>
      {await debtProjection(scope.request, debt)}
    </>
  );
}
