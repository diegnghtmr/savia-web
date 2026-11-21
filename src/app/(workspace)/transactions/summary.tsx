import { money } from "@/lib/account-money";
import type { LedgerLabels, LedgerRow } from "@/lib/transactions-gateway";

export function TransactionSummary({
  row,
  labels,
}: {
  row: LedgerRow;
  labels: LedgerLabels;
}) {
  const fields = [
    ["Cuenta", labels.accounts.get(row.accountId) ?? "No disponible"],
    [
      "Categoría",
      row.categoryId &&
        (labels.categories.get(row.categoryId) ?? "No disponible"),
    ],
    [
      "Beneficiario",
      row.payeeId && (labels.payees.get(row.payeeId) ?? "No disponible"),
    ],
    ["Etiquetas", tagNames(row.tagIds, labels)],
  ];
  return (
    <>
      <p>
        {row.type} · {row.status} ·{" "}
        <time dateTime={row.occurredAt}>{row.occurredAt}</time>
      </p>
      <p className="type-finance-md">{money(row.amount)}</p>
      <dl>
        {fields.map(
          ([label, value]) =>
            value && (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ),
        )}
      </dl>
    </>
  );
}

export function tagNames(ids: string[], labels: LedgerLabels) {
  return ids.map((id) => labels.tags.get(id) ?? "No disponible").join(", ");
}
