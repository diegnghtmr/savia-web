import { notFound } from "next/navigation";
import { JobPoll } from "@/app/_components/job-poll";
import { dataAccess, dataId, dataObject } from "@/lib/data-access";

const routes = {
  runs: ["report-runs", "Ejecución del informe"],
  exports: ["export-jobs", "Exportación CSV"],
  backups: ["backup-jobs", "Respaldo completo"],
} as const;
const unavailable = "Respaldo completo no disponible.";

export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ kind: string; jobId: string }>;
}) {
  const { kind, jobId } = await params;
  const id = dataId(jobId);
  if (!id || !Object.hasOwn(routes, kind)) notFound();
  const [route, title] = routes[kind as keyof typeof routes];
  const access = await dataAccess();
  if (!access) return <p role="alert">No hay un espacio activo disponible.</p>;
  const backup = kind === "backups";
  if (backup && !access.workspace.isOwner)
    return <p role="alert">El respaldo solo está disponible al propietario.</p>;
  const response = await access.request(`${route}/${id}`);
  if (backup && (response?.status === 404 || response?.status === 501))
    return <p role="alert">{unavailable}</p>;
  if (response?.status === 404) notFound();
  const job = response?.status === 200 ? await dataObject(response) : null;
  if (!job || dataId(job.id) !== id)
    return <p role="alert">No pudimos consultar el archivo solicitado.</p>;
  const href = downloadHref(job, response?.headers.get("date"));
  return (
    <>
      <h1>{title}</h1>
      {job.status === "queued" || job.status === "processing" ? (
        <>
          <p role="status">Preparando archivo…</p>
          <JobPoll />
        </>
      ) : job.status !== "completed" ? (
        <p role="alert">No pudimos preparar el archivo.</p>
      ) : href ? (
        <a href={href} rel="noreferrer noopener" referrerPolicy="no-referrer">
          Descargar archivo
        </a>
      ) : (
        <p>El enlace de descarga no está disponible o ha vencido.</p>
      )}
    </>
  );
}

function downloadHref(job: Record<string, unknown>, date?: string | null) {
  const href = job.downloadUrl;
  if (typeof href !== "string" || typeof job.expiresAt !== "string")
    return null;
  const url = URL.parse(href);
  const expiry = /^\d{4}-\d{2}-\d{2}T/.test(job.expiresAt)
    ? Date.parse(job.expiresAt)
    : NaN;
  const time = Date.parse(date ?? "");
  const now = Number.isFinite(time) ? time : Date.now();
  const secure = url?.protocol === "https:" && !url.username && !url.password;
  return secure && expiry > now ? href : null;
}
