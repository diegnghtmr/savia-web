import { randomUUID } from "node:crypto";
import Link from "next/link";
import { DraftReceipt } from "@/app/_components/draft-receipt";
import { TransactionForm } from "@/app/_components/transaction-form";
import { hasDraftReceipt } from "@/lib/draft-idempotency";
import { money } from "@/lib/account-money";
import { requireProfile } from "@/lib/require-profile";
import { ledgerScope } from "@/lib/transactions-gateway";
import type { SearchParams } from "@/lib/view-filters";
import { TransactionSummary, tagNames } from "../summary";

export const metadata = { title: "Detalle de transacción" };

export default async function TransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ transactionId: string }>;
  searchParams?: Promise<SearchParams>;
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
  const id = row.id.toLowerCase();
  const editable =
    row.etag &&
    /^"[1-9]\d{0,9}"$/.test(row.etag) &&
    row.statusCode !== "voided" &&
    row.statusCode !== "reconciled";
  const editing = editable && (await searchParams)?.edit === "1";
  const path = `/transactions/${id}`;
  const key = `${scope.workspaceId}:${id}:${row.etag}`;
  const bound = row.etag && {
    id,
    workspaceId: scope.workspaceId,
    etag: row.etag,
    nonce: randomUUID(),
  };
  return (
    <>
      <Link className="call-to-action" href="/transactions">
        Volver a Transacciones
      </Link>
      <p className="eyebrow">Espacio: {scope.name}</p>
      <h1>{row.description || row.type}</h1>
      {(await hasDraftReceipt(id)) && <DraftReceipt id={id} />}
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
      {editable &&
        bound &&
        (editing ? (
          <>
            <h2>Editar transacción</h2>
            <TransactionForm
              key={`edit:${key}`}
              labels={labels}
              row={row}
              submission={{
                ...bound,
                mode: "edit",
                occurredAt: row.occurredAt,
              }}
            />
            <Link href={path}>Cancelar edición</Link>
          </>
        ) : (
          <>
            <Link className="call-to-action" href={`${path}?edit=1`}>
              Editar transacción
            </Link>
            {row.statusCode !== "draft" && (
              <>
                <h2>Anular transacción</h2>
                <p>
                  La anulación conserva el movimiento original y registra su
                  reversión.
                </p>
                <TransactionForm
                  key={`void:${key}`}
                  submission={{ ...bound, mode: "void" }}
                />
              </>
            )}
          </>
        ))}
    </>
  );
}
