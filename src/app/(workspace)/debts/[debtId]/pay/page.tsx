import Link from "next/link";
import { notFound } from "next/navigation";
import { DebtPaymentForm } from "@/app/_components/debt-payment-form";
import { debtId as validId, debtScope } from "@/lib/debts-gateway";
import { requireProfile } from "@/lib/require-profile";

export default async function PayDebtPage({
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
  const accounts = await scope.activeAccounts();
  const choices =
    accounts &&
    [...accounts.names].filter(
      ([id]) => accounts.currencies[id] === debt.currency,
    );
  return (
    <>
      <Link href={`/debts/${debt.id}`}>Volver a la deuda</Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Pago de {debt.name}</h1>
      {!accounts || !choices ? (
        <p role="alert">No pudimos cargar las cuentas.</p>
      ) : choices.length ? (
        <DebtPaymentForm
          key={`${scope.workspaceId}:${debt.id}`}
          bound={{
            workspaceId: scope.workspaceId,
            id: debt.id,
            currency: debt.currency,
            accounts: accounts.currencies,
          }}
          accounts={choices}
        />
      ) : (
        <p>No hay cuentas activas en {debt.currency}.</p>
      )}
    </>
  );
}
