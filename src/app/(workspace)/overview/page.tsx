import { redirect } from "next/navigation";
import { WorkspaceSelector } from "@/app/_components/workspace-selector";
import { requireSession } from "@/lib/session";
import { readWorkspaceContext } from "@/lib/workspace-context";

export const metadata = { title: "Vista general" };

export default async function OverviewPage() {
  const { accessToken } = await requireSession();
  const result = await readWorkspaceContext(accessToken);
  if (result.kind === "unauthenticated") redirect("/sign-in");
  if (result.kind === "failed") {
    return (
      <>
        <h1>Vista general</h1>
        <p className="lead">No pudimos cargar tus espacios.</p>
        <form action="/overview" method="get">
          <button className="submit" type="submit">
            Volver a intentar
          </button>
        </form>
      </>
    );
  }
  const { active, items } = result;
  if (!active) {
    return (
      <>
        <h1>Vista general</h1>
        <p className="lead">No tienes espacios disponibles.</p>
      </>
    );
  }
  return (
    <>
      <p className="eyebrow">Vista general</p>
      <h1 style={{ overflowWrap: "anywhere" }}>{active.name}</h1>
      <WorkspaceSelector key={active.id} items={items} active={active.id} />
    </>
  );
}
