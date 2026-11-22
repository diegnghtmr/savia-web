import Link from "next/link";
import { notFound } from "next/navigation";
import { fundId as validId, fundScope } from "@/lib/funds-gateway";
import { requireProfile } from "@/lib/require-profile";
import { FundSummary } from "../summary";

export default async function FundPage({
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
  return (
    <>
      <Link href="/funds">Volver a Fondos</Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>{fund.name}</h1>
      <FundSummary fund={fund} />
      <Link href={`/funds/${fund.id}/contribute`} prefetch={false}>
        Registrar aporte
      </Link>
    </>
  );
}
