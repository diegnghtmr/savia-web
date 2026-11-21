import Link from "next/link";
import { money } from "@/lib/account-money";
import { requireProfile } from "@/lib/require-profile";
import { ledgerScope } from "@/lib/transactions-gateway";
import { TransactionSummary, tagNames } from "../summary";

export const metadata = { title: "Detalle de transacción" };

export default async function TransactionPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const profile = await requireProfile();
  if (profile.kind === "failed")
    return <p role="alert">No pudimos consultar tu perfil.</p>;
  const scope = await ledgerScope(profile.accessToken);
  if (!scope) return <Link href="/overview">Revisa el espacio activo</Link>;
  const row = await scope.getTransaction((await params).transactionId);
  const labels = row && (await scope.lookups());
  if (!row || !labels)
    return (
      <p role="alert">No pudimos cargar la transacción. Vuelve a intentarlo.</p>
    );
  return (
    <>
      <Link className="call-to-action" href="/transactions">
        Volver a Transacciones
      </Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>{row.description || row.type}</h1>
      <TransactionSummary row={row} labels={labels} />
      {row.notes && (
        <>
          <h2>Notas</h2>
          <p>{row.notes}</p>
        </>
      )}
      {row.splits.length > 0 && (
        <>
          <h2>Divisiones</h2>
          <ul>
            {row.splits.map((split, index) => (
              <li key={index}>
                {labels.categories.get(split.categoryId) ??
                  "Categoría no disponible"}
                : <span className="type-finance-md">{money(split.amount)}</span>
                {split.tagIds.length > 0 && (
                  <p>Etiquetas: {tagNames(split.tagIds, labels)}</p>
                )}
                {split.notes && <p>{split.notes}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
