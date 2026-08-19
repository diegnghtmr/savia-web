import Link from "next/link";
import { requireSession } from "@/lib/session";
import { signOutAction } from "../_actions/auth";
import { OnboardingForm } from "../_components/onboarding-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Crea tu espacio",
  description: "Prepara Savia con tus datos y preferencias.",
};

export default async function OnboardingPage() {
  await requireSession();

  return (
    <>
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>
      <header className="site-header">
        <nav aria-label="Navegación principal">
          <strong>Savia</strong>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <Link href="/">Inicio</Link>
            <form action={signOutAction}>
              <button
                type="submit"
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  font: "inherit",
                  padding: "0.25rem 0.5rem",
                  textDecoration: "underline",
                }}
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </nav>
      </header>
      <main className="task-shell" id="contenido-principal" tabIndex={-1}>
        <p className="eyebrow">Primeros pasos</p>
        <h1>Crea tu espacio</h1>
        <p className="lead">
          Con estos datos preparamos Savia a tu medida. Podrás cambiarlos
          después.
        </p>
        <OnboardingForm />
      </main>
      <footer className="site-footer">Savia</footer>
    </>
  );
}
