import Link from "next/link";
import { saveCapability } from "@/app/_actions/capabilities";
import { CapabilityForm } from "@/app/_components/capability-form";
import { CapabilityReceipt } from "@/app/_components/capability-receipt";
import { categoryKinds } from "@/lib/catalog-input";
import { requireProfile } from "@/lib/require-profile";
import { ledgerScope } from "@/lib/transactions-gateway";
import type { SearchParams } from "@/lib/view-filters";
import { canWriteWorkspace } from "@/lib/workspace-roles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catálogos" };

const forms = [
  ["catalog-category", "Crear categoría"],
  ["catalog-payee", "Crear beneficiario"],
  ["catalog-tag", "Crear etiqueta"],
] as const;

export default async function Catalogs({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const scope = await ledgerScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const { guardado } = await searchParams;
  const binding = { workspaceId: scope.workspaceId, userId: profile.userId };
  const writer = canWriteWorkspace(scope.role);
  const parents = writer ? await scope.categories() : null;
  return (
    <>
      <Link href="/transactions">Volver a Transacciones</Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>Catálogos</h1>
      {guardado && <CapabilityReceipt requested={guardado} {...binding} />}
      {!writer && <p>Tu rol no permite crear elementos en este espacio.</p>}
      {writer &&
        forms.map(([kind, label]) => (
          <section key={kind} aria-labelledby={kind}>
            <h2 id={kind}>{label}</h2>
            <CapabilityForm
              label={label}
              action={saveCapability.bind(null, { ...binding, kind })}
            >
              <label className="field">
                Nombre
                <input name="name" required maxLength={120} />
              </label>
              {kind === "catalog-category" && (
                <CategoryFields parents={parents} />
              )}
            </CapabilityForm>
          </section>
        ))}
    </>
  );
}

function CategoryFields({ parents }: { parents: Map<string, string> | null }) {
  return (
    <>
      <label className="field">
        Tipo
        <select name="kind" defaultValue="" required>
          <option value="">Selecciona un tipo</option>
          {Object.entries(categoryKinds).map(([kind, name]) => (
            <option key={kind} value={kind}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {parents ? (
        <label className="field">
          Categoría superior (opcional)
          <select name="parentId" defaultValue="">
            <option value="">Ninguna</option>
            {[...parents].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p>No pudimos cargar las categorías superiores.</p>
      )}
      <label className="field">
        Icono (opcional)
        <input name="icon" />
      </label>
      <label className="field">
        Identificador de color (opcional)
        <input name="colorToken" />
      </label>
      <label className="field">
        Esencial
        <input type="checkbox" name="essential" value="yes" />
      </label>
    </>
  );
}
