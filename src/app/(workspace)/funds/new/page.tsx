import Link from "next/link";
import { FundForm } from "@/app/_components/fund-form";
import { requireProfile } from "@/lib/require-profile";
import { ledgerScope } from "@/lib/transactions-gateway";

export const dynamic = "force-dynamic";

export default async function NewFundPage() {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const scope = await ledgerScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const accounts = await scope.activeAccounts();
  return (
    <>
      <Link href="/funds">Volver a Fondos</Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Nuevo fondo</h1>
      {!accounts && (
        <p role="alert">No pudimos cargar las cuentas para vincular.</p>
      )}
      <FundForm
        key={scope.workspaceId}
        bound={{ workspaceId: scope.workspaceId }}
        accounts={[...(accounts?.names ?? [])]}
      />
    </>
  );
}
