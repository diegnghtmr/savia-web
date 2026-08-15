import Link from "next/link";
import { OnboardingForm } from "../_components/onboarding-form";

export const metadata = {
  title: "Crea tu espacio",
  description: "Prepara Savia con tus datos y preferencias.",
};

export default function OnboardingPage() {
  return (
    <>
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>
      <header className="site-header">
        <nav aria-label="Navegación principal">
          <strong>Savia</strong>
          <Link href="/">Inicio</Link>
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
