import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { FxFreshness } from "@/app/_components/insights-period-form";
import {
  ScenarioCreation,
  ScenarioSimulation,
} from "@/app/_components/scenario-forms";
import { requireProfile } from "@/lib/require-profile";
import { readScenarios } from "@/lib/scenario-gateway";
import { readWorkspaceContext } from "@/lib/workspace-context";

export const metadata = { title: "Escenarios" };
export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos cargar Savia.</p>;
  const scope = await readWorkspaceContext(profile.accessToken);
  if (scope.kind === "unauthenticated") redirect("/sign-in");
  const space = scope.kind === "ok" && scope.active;
  if (!space || !space.baseCurrency)
    return <p role="alert">No hay un espacio activo disponible.</p>;
  const page = await readScenarios(profile.accessToken, space);
  const bound = {
    workspaceId: space.id,
    userId: profile.userId,
    currency: space.baseCurrency,
  };
  return (
    <>
      <p className="eyebrow">{space.name}</p>
      <h1>Escenarios</h1>
      <p>Las simulaciones no modifican tu saldo ni tus movimientos.</p>
      <FxFreshness />
      <ScenarioCreation bound={{ ...bound, nonce: randomUUID() }} />
      <h2>Escenarios guardados</h2>
      {!page ? (
        <p role="alert">No pudimos cargar los escenarios.</p>
      ) : page.items.length > 0 ? (
        <ul>
          {page.items.map(({ id, name }) => (
            <li key={id}>
              <ScenarioSimulation
                name={name}
                bound={{ ...bound, id, key: randomUUID() }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay escenarios guardados.</p>
      )}
      {page?.cursor && <p>Se muestran resultados parciales.</p>}
    </>
  );
}
