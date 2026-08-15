import Link from "next/link";

const tasks = [
  ["Qué cambió", "Identifica los cambios que requieren tu atención."],
  ["Qué revisar", "Revisa cada pendiente antes de continuar."],
  ["Qué sigue", "Elige el próximo paso cuando estés listo."],
] as const;

export default function Page() {
  return (
    <>
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>
      <header className="site-header">
        <nav aria-label="Navegación principal">
          <strong>Savia</strong>
          <Link aria-current="page" href="/">
            Inicio
          </Link>
        </nav>
      </header>
      <main className="task-shell" id="contenido-principal" tabIndex={-1}>
        <p className="eyebrow">Inicio</p>
        <h1>Organiza lo que sigue</h1>
        <p className="lead">Revisa tus pendientes y elige tu próximo paso.</p>
        <ol className="task-list">
          {tasks.map(([title, description]) => (
            <li key={title}>
              <h2>{title}</h2>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <p>
          <Link className="call-to-action" href="/onboarding">
            Crear mi espacio
          </Link>
        </p>
      </main>
      <footer className="site-footer">Savia</footer>
    </>
  );
}
