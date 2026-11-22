import Link from "next/link";
import { notFound } from "next/navigation";
import { FundForm } from "@/app/_components/fund-form";
import { fundId as validId, fundScope } from "@/lib/funds-gateway";
import { requireProfile } from "@/lib/require-profile";

export default async function ContributePage({
  params,
}: {
  params: Promise<{ fundId: string }>;
}) {
  const { fundId } = await params;
  if (!validId(fundId)) notFound();
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const scope = await fundScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const fund = await scope.detail(fundId.toLowerCase());
  if (fund === "not-found") notFound();
  if (!fund) return <p role="alert">No pudimos encontrar el fondo</p>;
  const accounts = await scope.activeAccounts();
  const choices =
    accounts &&
    [...accounts.names].filter(
      ([id]) => accounts.currencies[id] === fund.currency,
    );
  return (
    <>
      <Link href={`/funds/${fund.id}`}>Volver al fondo</Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Aporte a {fund.name}</h1>
      {!choices ? (
        <p role="alert">No pudimos cargar las cuentas.</p>
      ) : choices.length ? (
        <FundForm
          key={`${scope.workspaceId}:${fund.id}`}
          bound={{
            workspaceId: scope.workspaceId,
            contribution: {
              id: fund.id,
              currency: fund.currency,
              accounts: accounts.currencies,
            },
          }}
          accounts={choices}
        />
      ) : (
        <p>No hay cuentas activas en {fund.currency}.</p>
      )}
    </>
  );
}
