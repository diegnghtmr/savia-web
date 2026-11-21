import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/_actions/auth";

// Protected pages must guard their own data; layouts can be reused on navigation.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>
      <header className="site-header">
        <nav aria-label="Navegación principal">
          <Link href="/overview">Savia</Link>
          <Link href="/accounts">Cuentas</Link>
          <form action={signOutAction}>
            <button className="submit" type="submit">
              Cerrar sesión
            </button>
          </form>
        </nav>
      </header>
      <main className="task-shell" id="contenido-principal" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">Savia</footer>
    </>
  );
}
