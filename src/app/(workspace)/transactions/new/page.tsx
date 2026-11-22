import Link from "next/link";
import { TransactionForm } from "@/app/_components/transaction-form";
import { requireProfile } from "@/lib/require-profile";
import { ledgerScope, types } from "@/lib/transactions-gateway";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva transacción" };

export default async function NewTransactionPage() {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const scope = await ledgerScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const labels = await scope.lookups();
  return (
    <>
      <Link className="call-to-action" href="/transactions">
        Volver a Transacciones
      </Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Nueva transacción</h1>
      {!labels ? (
        <p role="alert">No pudimos cargar las opciones de la transacción.</p>
      ) : Object.keys(labels.currencies).length ? (
        <TransactionForm
          labels={labels}
          types={types}
          key={scope.workspaceId}
          submission={{
            mode: "create",
            workspaceId: scope.workspaceId,
            currencies: labels.currencies,
          }}
        />
      ) : (
        <Link href="/accounts">Crea o activa una cuenta para continuar</Link>
      )}
    </>
  );
}
