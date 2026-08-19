import Link from "next/link";
import { signUpAction } from "../_actions/auth";
import { AuthForm } from "../_components/auth-form";

export const metadata = {
  title: "Crear cuenta",
  description: "Crea tu cuenta en Savia.",
};

export default function SignUpPage() {
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
        <h1>Crear cuenta</h1>
        <p className="lead">
          Crea tu cuenta con correo y contraseña para empezar.
        </p>
        <AuthForm mode="sign-up" action={signUpAction} />
        <p style={{ marginTop: "1.5rem" }}>
          ¿Ya tienes una cuenta? <Link href="/sign-in">Inicia sesión</Link>
        </p>
      </main>
      <footer className="site-footer">Savia</footer>
    </>
  );
}
