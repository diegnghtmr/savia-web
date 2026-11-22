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
          <Link href="/transactions" prefetch={false}>
            Transacciones
          </Link>
          <Link href="/transfers" prefetch={false}>
            Transferencias
          </Link>
          <Link href="/budgets" prefetch={false}>
            Presupuestos
          </Link>
          <Link href="/funds" prefetch={false}>
            Fondos
          </Link>
          <Link href="/debts" prefetch={false}>
            Deudas
          </Link>
          <Link href="/analytics" prefetch={false}>
            Analítica
          </Link>
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
