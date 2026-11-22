import { render, screen } from "@testing-library/react";
import ImportJobPage from "@/app/(workspace)/imports/[jobId]/page";
import ReceiptPage from "@/app/(workspace)/receipts/[receiptId]/page";
import ArtifactPage from "@/app/(workspace)/reports/[kind]/[jobId]/page";
import { saveData } from "@/app/_actions/data";
import { admitDraftSeed } from "@/lib/draft-idempotency";
import { prepareDraft } from "@/lib/draft-preparation";
import { requireSession } from "@/lib/session";

const workspaceId = "80000000-0000-4000-8000-000000000001";
const other = "80000000-0000-4000-8000-000000000002";
const id = "80000000-0000-4000-8000-000000000003";
const recordId = "80000000-0000-4000-8000-000000000004";
const limit = 768 * 1024;
const fetchImpl = vi.fn<typeof fetch>();
type Write = { path: string; key: string | null; body: RequestInit["body"] };
const writes: Write[] = [];
let cookie: Map<string, string>;
let membership: string;
let role: string;
let clock: number;
let status: number;
let read: Record<string, unknown>;
vi.mock("@/app/_components/job-poll", () => ({ JobPoll: () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: cookie.get(name) }),
    getAll: () => [...cookie].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => cookie.set(name, value),
  }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "offline" })),
}));
beforeEach(() => {
  vi.clearAllMocks();
  cookie = new Map([["savia-workspace", workspaceId]]);
  membership = workspaceId;
  role = "owner";
  clock = Date.parse("2026-02-01T12:00:00Z");
  status = 202;
  read = { id };
  writes.length = 0;
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  vi.stubGlobal("fetch", fetchImpl);
  fetchImpl.mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const date = new Date(clock).toUTCString();
    if (path === "/v1/me") return Response.json({ id });
    if (path === "/v1/workspaces")
      return Response.json(
        {
          items: [{ id: membership, name: "Casa", role }],
          pageInfo: { hasNextPage: false },
        },
        { headers: { date } },
      );
    const headers = new Headers(init?.headers);
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("manual");
    expect(headers.get("x-workspace-id")).toBe(workspaceId);
    if (!init?.method)
      return Response.json(read, { status, headers: { date } });
    expect(init.method).toBe("POST");
    writes.push({ path, key: headers.get("idempotency-key"), body: init.body });
    return Response.json({ id: recordId }, { status });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function form(fields: Record<string, string | File> = {}) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  return body;
}
// jsdom's File lacks Blob.arrayBuffer; read the real fixture bytes via FileReader.
class FixtureFile extends File {
  arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  }
}
const file = (name: string, type: string, bytes = "test fixture") =>
  new FixtureFile([bytes], name, { type });
const bound = (kind: string, target?: string) => ({
  workspaceId,
  kind,
  id: target,
});
async function reserve(kind: string, input: FormData, target?: string) {
  return prepareDraft(() => saveData(bound(kind, target), null, input));
}
async function dispatch(kind: string, input: FormData, target?: string) {
  const reservation = await reserve(kind, input, target);
  expect(reservation.prepared).toEqual(expect.any(String));
  input.set("draftPrepared", reservation.prepared!);
  const preDispatch = new Map(cookie);
  const result = await saveData(bound(kind, target), null, input);
  cookie = preDispatch; // Simulate losing every header of the dispatch response.
  return result;
}

it.each([
  file("other.exe", "text/csv"),
  file("fake.csv", "image/png"),
  file("empty.csv", "text/csv", ""),
  file("big.csv", "text/csv", "x".repeat(limit + 1)),
])("rejects an invalid statement file before session", async (invalid) => {
  const original = new Map(cookie);
  const input = form({ file: invalid });
  const result = await saveData(bound("import-upload"), null, input);
  expect(result).toEqual({
    error: "Selecciona un archivo CSV, QIF u OFX de hasta 768 KiB.",
  });
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(cookie).toEqual(original);
});

it.each([
  ["statement.CSV", "text/csv", "csv"],
  ["statement.qif", "", "qif"],
  ["statement.ofx", "application/octet-stream", "ofx"],
])("replays an upload of %s", async (name, mime, format) => {
  expect(await admitDraftSeed(workspaceId)).toBe(true);
  const upload = () => form({ file: file(name, mime) });
  const expected = { receipt: recordId, href: `/imports/${recordId}` };
  expect(await dispatch("import-upload", upload())).toEqual(expected);
  expect(await dispatch("import-upload", upload())).toEqual(expected);
  expect(writes).toHaveLength(2);
  expect(writes[0].key).toMatch(/^[\da-f-]{36}$/);
  expect(writes[1].key).toBe(writes[0].key);
  expect(writes.every(({ path }) => path === "/v1/import-jobs")).toBe(true);
  const multipart = writes[0].body as FormData;
  expect(multipart.get("formatHint")).toBe(format);
  expect((multipart.get("file") as File).name).toBe(name);
  expect([...cookie.values()].join()).not.toContain("test fixture");
  clock += 23 * 60 * 60 * 1000;
  expect(await reserve("import-upload", upload())).toEqual({
    state: { confirmation: expect.any(String), error: expect.any(String) },
  });
  expect(writes).toHaveLength(2);
});

it("blocks a stale upload before draft reservation", async () => {
  expect(await admitDraftSeed(workspaceId)).toBe(true);
  const original = new Map(cookie);
  membership = other;
  const input = form({ file: file("ok.csv", "text/csv") });
  expect(await reserve("import-upload", input)).toEqual({
    state: { error: "El espacio activo cambió. Vuelve a abrir el formulario." },
  });
  expect(cookie).toEqual(original);
  expect(writes).toHaveLength(0);
});

it("commits a confirmed mapping and skips duplicates", async () => {
  const mapping = {
    accountId: id,
    date: "fecha",
    amount: "importe",
    description: "memo",
    dateFormat: "YYYY-MM-DD",
    debitSign: "negative",
    accept: "yes",
  };
  const original = new Map(cookie);
  const invalid = [
    { accept: "" },
    { description: "fecha" },
    { dateFormat: "bad" },
  ];
  for (const changes of invalid) {
    const input = form({ ...mapping, ...changes });
    expect(await saveData(bound("import-commit", id), null, input)).toEqual({
      error: "Revisa la cuenta, las columnas y la confirmación.",
    });
  }
  expect(requireSession).not.toHaveBeenCalled();
  expect(cookie).toEqual(original);
  expect(writes).toHaveLength(0);
  expect(await admitDraftSeed(workspaceId)).toBe(true);
  expect(await dispatch("import-commit", form(mapping), id)).toEqual({
    receipt: recordId,
    href: `/imports/${id}`,
  });
  expect(writes[0].path).toBe(`/v1/import-jobs/${id}/commit`);
  expect(JSON.parse(String(writes[0].body))).toEqual({
    accountId: id,
    columnMapping: { fecha: "date", importe: "amount", memo: "description" },
    dateFormat: "YYYY-MM-DD",
    debitSign: "negative",
    skipDuplicateCandidates: true,
  });
});

it("shows classified totals without exposing raw rows", async () => {
  status = 200;
  read = {
    id,
    status: "awaiting_mapping",
    validRows: 2,
    duplicateRows: 1,
    errorRows: 0,
    rows: ["raw fixture"],
  };
  render(await ImportJobPage({ params: Promise.resolve({ jobId: id }) }));
  expect(screen.getByText("Válidas: 2")).toBeVisible();
  expect(screen.getByText("Duplicadas: 1")).toBeVisible();
  expect(screen.getByText("Con errores: 0")).toBeVisible();
  expect(screen.queryByText("raw fixture")).not.toBeInTheDocument();
});

it("uploads a receipt and confirms an exact expense", async () => {
  expect(await admitDraftSeed(workspaceId)).toBe(true);
  const input = form({ file: file("ticket.pdf", "application/pdf") });
  expect(await dispatch("receipt-upload", input)).toEqual({
    receipt: recordId,
    href: `/receipts/${recordId}`,
  });
  expect(writes[0].path).toBe("/v1/receipts");
  expect((writes[0].body as FormData).get("processingPreference")).toBe(
    "savia",
  );
  const reviewed = form({
    accountId: id,
    date: "2026-01-01",
    amount: "123,45",
    currency: "COP",
    description: "Tienda",
    accept: "yes",
  });
  status = 201;
  expect(await dispatch("receipt-confirm", reviewed, id)).toEqual({
    receipt: recordId,
    href: `/transactions/${recordId}`,
  });
  expect(writes[1].path).toBe(`/v1/receipts/${id}/confirm`);
  expect(JSON.parse(String(writes[1].body))).toEqual({
    transaction: {
      accountId: id,
      occurredAt: "2026-01-01T00:00:00Z",
      type: "expense",
      amount: { currency: "COP", amountMinor: "12345" },
      description: "Tienda",
    },
  });
  status = 409;
  expect(await dispatch("receipt-confirm", reviewed, id)).toEqual({
    error: "La operación cambió. Revisa su estado antes de continuar.",
    href: `/receipts/${id}`,
  });
  expect(writes[2].key).toBe(writes[1].key);
});

it("links the receipt to its confirmed transaction", async () => {
  status = 200;
  read = { id, status: "confirmed", transactionId: recordId };
  render(await ReceiptPage({ params: Promise.resolve({ receiptId: id }) }));
  expect(screen.getByRole("link", { name: "Ver transacción" })).toHaveAttribute(
    "href",
    `/transactions/${recordId}`,
  );
});

it("creates definitions, runs reports and queues exports", async () => {
  expect(await admitDraftSeed(workspaceId)).toBe(true);
  const definition = form({
    name: " Por mes ",
    dimension: "month",
    measure: "sum",
  });
  status = 201;
  await dispatch("report-create", definition);
  status = 202;
  const period = { from: "2026-01-01", to: "2026-02-01" };
  await dispatch("report-run", form({ format: "pdf", ...period }), id);
  await dispatch("export", form(period));
  const sent = writes.map(({ path, body }) => [path, JSON.parse(String(body))]);
  expect(sent).toEqual([
    [
      "/v1/report-definitions",
      {
        name: "Por mes",
        dimensions: ["month"],
        measures: ["sum"],
        visualization: "table",
      },
    ],
    ["/v1/report-runs", { definitionId: id, format: "pdf", filters: period }],
    ["/v1/export-jobs", { format: "csv", resource: "transactions", ...period }],
  ]);
});

it("rejects invalid report periods before calling session", async () => {
  const bad = [
    { format: "html" },
    { format: "pdf", from: "2026-02-30", to: "2026-03-01" },
    { format: "pdf", from: "2026-02-01", to: "2026-01-01" },
  ];
  for (const data of bad) {
    const { format, from = "", to = "" } = data;
    const input = form({ format, from, to });
    expect(await saveData(bound("report-run", id), null, input)).toEqual({
      error: "Revisa el formato y el período.",
    });
  }
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it.each([404, 501])("checks backup access and %s", async (unsupported) => {
  expect(await admitDraftSeed(workspaceId)).toBe(true);
  const original = new Map(cookie);
  role = "editor";
  expect(await reserve("backup", form())).toEqual({
    state: { error: "Solo el propietario puede crear un respaldo completo." },
  });
  expect(cookie).toEqual(original);
  expect(writes).toHaveLength(0);
  role = "owner";
  status = unsupported;
  expect(await dispatch("backup", form())).toEqual({
    error: "Respaldo completo no disponible.",
  });
  expect(writes[0]).toMatchObject({ path: "/v1/backup-jobs", body: undefined });
  const params = Promise.resolve({ kind: "backups", jobId: id });
  render(await ArtifactPage({ params }));
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Respaldo completo no disponible.");
});

it.each([
  [
    "processing",
    "https://download.test/archive",
    "2026-02-01T13:00:00Z",
    false,
  ],
  ["completed", "http://download.test/archive", "2026-02-01T13:00:00Z", false],
  ["completed", "https://download.test/archive", "2026-02-01T12:00:00Z", false],
  ["completed", "https://download.test/archive", "2026-02-01T13:00:00Z", true],
])("filters download links (%s)", async (state, url, expiresAt, available) => {
  status = 200;
  read = { id, status: state, downloadUrl: url, expiresAt };
  const params = Promise.resolve({ kind: "backups", jobId: id });
  render(await ArtifactPage({ params }));
  const link = screen.queryByRole("link", { name: "Descargar archivo" });
  if (!available) expect(link).not.toBeInTheDocument();
  else {
    expect(link).toHaveAttribute("href", url);
    expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
  }
});
