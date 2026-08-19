import Link from "next/link";
import { signInAction } from "../_actions/auth";
import { AuthForm } from "../_components/auth-form";

export const metadata = {
  title: "Iniciar sesión",
  description: "Accede a tu cuenta en Savia.",
};

export default function SignInPage() {
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
        <p className="eyebrow">Autenticación</p>
        <h1>Iniciar sesión</h1>
        <p className="lead">
          Ingresa tus credenciales para continuar en Savia.
        </p>
        <AuthForm mode="sign-in" action={signInAction} />
        <p style={{ marginTop: "1.5rem" }}>
          ¿No tienes una cuenta? <Link href="/sign-up">Regístrate</Link>
        </p>
      </main>
      <footer className="site-footer">Savia</footer>
    </>
  );
}
