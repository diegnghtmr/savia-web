import "server-only";

import { createHash } from "node:crypto";
import { decimalToMinor } from "./account-money";
import { dataId } from "./data-access";
import { uploadFormat, uploadMessages, type UploadKind } from "./data-upload";
import { fields } from "./financial-draft";
import { calendarDate } from "./view-filters";

export type DataBinding = { workspaceId: string; kind: string; id?: string };
export type DataResult = {
  error?: string;
  confirmation?: string;
  receipt?: string;
  href?: string;
};
type Command = {
  route: string;
  payload: object;
  multipart?: FormData;
  href: (id: string) => string;
  conflictHref?: string;
  status?: 201;
  ownerOnly?: true;
};

async function upload(
  kind: UploadKind,
  form: FormData,
): Promise<Command | string> {
  const values = form.getAll("file");
  const file = values[0];
  if (values.length !== 1 || !(file instanceof File))
    return uploadMessages[kind];
  const format = uploadFormat(kind, file);
  if (!format) return uploadMessages[kind];
  const importFile = kind === "import-upload";
  const options: Record<string, string> = importFile
    ? { formatHint: format }
    : { processingPreference: "savia" };
  const multipart = new FormData();
  multipart.set("file", file);
  for (const [key, value] of Object.entries(options)) multipart.set(key, value);
  // Only the fingerprint participates in durable draft identity, not the bytes.
  const sha256 = createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex");
  return {
    route: importFile ? "import-jobs" : "receipts",
    payload: { sha256, name: file.name, type: file.type, ...options },
    multipart,
    href: (id) => `/${importFile ? "imports" : "receipts"}/${id}`,
  };
}

function commitImport(id: string | null, form: FormData): Command | string {
  const labels = [
    "date",
    "amount",
    "description",
    "debitCreditIndicator",
  ] as const;
  const data = fields(form, ["accountId", "accept", "dateFormat", "debitSign"]);
  const accountId = dataId(data?.accountId);
  const invalid = "Revisa la cuenta, las columnas y la confirmación.";
  if (!id || !accountId || !data || data.accept !== "yes") return invalid;
  const { dateFormat, debitSign } = data;
  if (
    !["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"].includes(dateFormat) ||
    !["negative", "positive", "separate_column"].includes(debitSign)
  )
    return invalid;
  const entries = new Map<string, string>();
  for (const label of labels) {
    const values = form.getAll(label);
    const [name = ""] = values;
    if (values.length > 1 || typeof name !== "string") return invalid;
    if (label === "debitCreditIndicator" && debitSign !== "separate_column") {
      if (name !== "") return invalid;
      continue;
    }
    if (
      !name ||
      name.includes("\0") ||
      name.length > 120 ||
      entries.has(name) ||
      ["__proto__", "constructor", "prototype"].includes(name)
    )
      return invalid;
    entries.set(name, label);
  }
  return {
    route: `import-jobs/${id}/commit`,
    payload: {
      accountId,
      columnMapping: Object.fromEntries(entries),
      dateFormat,
      debitSign,
      skipDuplicateCandidates: true,
    },
    href: () => `/imports/${id}`,
    conflictHref: `/imports/${id}`,
  };
}

function confirmReceipt(id: string | null, form: FormData): Command | string {
  const data = fields(form, [
    "accountId",
    "currency",
    "date",
    "amount",
    "description",
    "accept",
  ]);
  const accountId = dataId(data?.accountId);
  const invalid = "Revisa los datos del gasto y la confirmación.";
  if (
    !id ||
    !accountId ||
    !data ||
    data.accept !== "yes" ||
    !/^[A-Z]{3}$/.test(data.currency) ||
    !calendarDate(data.date) ||
    [...data.description].length > 500
  )
    return invalid;
  const amountMinor = decimalToMinor(data.amount, data.currency);
  if (amountMinor === null || BigInt(amountMinor) <= BigInt(0)) return invalid;
  return {
    route: `receipts/${id}/confirm`,
    status: 201,
    payload: {
      transaction: {
        accountId,
        occurredAt: `${data.date}T00:00:00Z`,
        type: "expense",
        amount: { currency: data.currency, amountMinor },
        ...(data.description && { description: data.description }),
      },
    },
    href: (transactionId) => `/transactions/${transactionId}`,
    conflictHref: `/receipts/${id}`,
  };
}

function reportDefinition(form: FormData): Command | string {
  const data = fields(form, ["name", "dimension", "measure"]);
  if (
    !data?.name ||
    [...data.name].length > 120 ||
    !["month", "category", "account"].includes(data.dimension) ||
    !["sum", "count"].includes(data.measure)
  )
    return "Revisa el nombre, la dimensión y la medida del informe.";
  return {
    route: "report-definitions",
    status: 201,
    payload: {
      name: data.name,
      dimensions: [data.dimension],
      measures: [data.measure],
      visualization: "table",
    },
    href: () => "/reports",
  };
}

function reportJob(
  kind: "report-run" | "export",
  id: string | null,
  form: FormData,
): Command | string {
  const data = fields(form, ["from", "to", "format"]);
  const invalid = "Revisa el formato y el período.";
  if (!data) return invalid;
  const { from, to, format } = data;
  if ((from || to) && (!calendarDate(from) || !calendarDate(to) || from > to))
    return invalid;
  const period = from ? { from, to } : {};
  if (kind === "export")
    return {
      route: "export-jobs",
      payload: { format: "csv", resource: "transactions", ...period },
      href: (job) => `/reports/exports/${job}`,
    };
  if (!id || !["csv", "pdf", "json"].includes(format)) return invalid;
  return {
    route: "report-runs",
    payload: { definitionId: id, format, filters: period },
    href: (job) => `/reports/runs/${job}`,
  };
}

export async function dataCommand(
  bound: DataBinding,
  form: FormData,
): Promise<Command | string> {
  const id = dataId(bound.id);
  switch (bound.kind) {
    case "import-upload":
    case "receipt-upload":
      return upload(bound.kind, form);
    case "import-commit":
      return commitImport(id, form);
    case "receipt-confirm":
      return confirmReceipt(id, form);
    case "report-create":
      return reportDefinition(form);
    case "report-run":
    case "export":
      return reportJob(bound.kind, id, form);
    case "backup":
      return {
        route: "backup-jobs",
        payload: {},
        ownerOnly: true,
        href: (job) => `/reports/backups/${job}`,
      };
    default:
      return "Esta operación no está disponible.";
  }
}
