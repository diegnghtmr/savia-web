import Link from "next/link";
import { TransferForm } from "@/app/_components/transfer-form";
import { requireProfile } from "@/lib/require-profile";
import { ledgerScope } from "@/lib/transactions-gateway";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transferencias" };

export default async function TransfersPage() {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const scope = await ledgerScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const accounts = await scope.activeAccounts();
  return (
    <>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Transferencias</h1>
      <Link className="call-to-action" href="/exchange-rates">
        Tasas de cambio
      </Link>
      {!accounts ? (
        <p role="alert">No pudimos cargar las cuentas.</p>
      ) : Object.keys(accounts.currencies).length >= 2 ? (
        <TransferForm
          key={scope.workspaceId}
          accounts={accounts.names}
          bound={{
            workspaceId: scope.workspaceId,
            currencies: accounts.currencies,
          }}
        />
      ) : (
        <Link href="/accounts">
          Necesitas dos cuentas activas para transferir
        </Link>
      )}
    </>
  );
}
