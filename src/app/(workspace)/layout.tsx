import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/_actions/auth";
import { getCurrentUser } from "@/lib/profile-gateway";
import { requireSession } from "@/lib/session";

// Keep the cookie guard request-scoped even when build-time config is absent.
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { accessToken } = await requireSession();
  const profile = await getCurrentUser(accessToken);
  if (profile.kind === "notOnboarded") redirect("/onboarding");
  if (profile.kind === "unauthenticated") redirect("/sign-in");

  return (
    <>
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>
      <header className="site-header">
        <nav aria-label="Navegación principal">
          <Link href="/overview">Savia</Link>
          <form action={signOutAction}>
            <button className="submit" type="submit">
              Cerrar sesión
            </button>
          </form>
        </nav>
      </header>
      <main className="task-shell" id="contenido-principal" tabIndex={-1}>
        {profile.kind === "failed" ? (
          <>
            <h1>No pudimos cargar Savia</h1>
            <p className="lead">
              No pudimos consultar tu perfil. Vuelve a intentarlo en un momento.
            </p>
            <form action="/overview" method="get">
              <button className="submit" type="submit">
                Volver a intentar
              </button>
            </form>
          </>
        ) : (
          children
        )}
      </main>
      <footer className="site-footer">Savia</footer>
    </>
  );
}
