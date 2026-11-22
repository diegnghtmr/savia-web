import { render, screen } from "@testing-library/react";
import Detail from "@/app/(workspace)/transactions/[transactionId]/page";
import List from "@/app/(workspace)/transactions/page";
import { saveTransactionAction } from "@/app/_actions/transactions";
import { requireSession } from "@/lib/session";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "savia-draft-seed"
        ? { value: "80000000-0000-4000-8000-000000000001" }
        : { value: "other-workspace" },
    set: vi.fn(),
  }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "offline-token" })),
}));

const id = "80000000-0000-4000-8000-000000000001";
const row = {
  id,
  accountId: id,
  categoryId: id,
  payeeId: id,
  tagIds: [id],
  type: "adjustment",
  status: "confirmed",
  description: "Reembolso",
  notes: "Verificado",
  occurredAt: "2026-01-03T12:00:00Z",
  amount: { amountMinor: "-900719925474099301", currency: "COP" },
};
const page = (items: unknown[], nextCursor?: string) => ({
  items,
  pageInfo: { hasNextPage: !!nextCursor, nextCursor },
});
const calls: [string, string | null][] = [];

beforeEach(() => {
  calls.length = 0;
  vi.mocked(requireSession).mockClear();
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test/savia");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stub(profileStatus = 200) {
  vi.stubGlobal("fetch", async (target: string, init: RequestInit) => {
    const url = new URL(target);
    const path = url.pathname.split("/v1/")[1];
    calls.push([
      path + url.search,
      new Headers(init.headers).get("x-workspace-id"),
    ]);
    if (path === "me") return Response.json({ id }, { status: profileStatus });
    if (path === "workspaces")
      return Response.json(page([{ id, name: "Casa" }]));
    if (path === "transactions") return Response.json(page([row], "next/2"));
    if (path === `transactions/${id}`) return Response.json(row);
    if (path === "categories" && !url.searchParams.has("cursor"))
      return Response.json(page([], "catalog/2"));
    const names = {
      accounts: "Caja",
      categories: "Alimentación",
      payees: "Mercado",
      tags: "Familia",
    };
    return Response.json(
      page([{ id, name: names[path as keyof typeof names] }]),
    );
  });
}
const searchParams = Promise.resolve({});
const params = Promise.resolve({ transactionId: id });

it.each([false, true])(
  "guards ledger before requesting workspace data (detail=%s)",
  async (detail) => {
    stub(503);
    render(detail ? await Detail({ params }) : await List({ searchParams }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos consultar tu perfil.",
    );
    expect(calls).toEqual([["me", null]]);
  },
);

it("forwards only contract filters and preserves them in the next link", async () => {
  stub();
  const filters = {
    accountId: id,
    categoryId: id,
    from: "2026-01-01",
    to: "2026-01-31",
    status: "confirmed",
    query: "café & pan",
    cursor: "next/1",
  };
  render(
    await List({
      searchParams: Promise.resolve({
        ...filters,
        workspaceId: "forged",
        payeeId: id,
      }),
    }),
  );
  expect(calls.slice(0, 2)).toEqual([
    ["me", null],
    ["workspaces", null],
  ]);
  expect(calls.filter(([path]) => path.startsWith("transactions?"))).toEqual([
    [`transactions?${new URLSearchParams({ limit: "20", ...filters })}`, id],
  ]);
  expect(calls.slice(2).every(([, workspace]) => workspace === id)).toBe(true);
  expect(screen.getByLabelText("Cuenta")).toHaveDisplayValue("Caja");
  expect(screen.getByLabelText("Categoría")).toHaveDisplayValue("Alimentación");
  expect(screen.getByText(/−COP\s9\.007\.199\.254\.740\.993,01/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
    "href",
    `/transactions?${new URLSearchParams({ ...filters, cursor: "next/2" })}`,
  );
});

it("rejects ambiguous or invalid filters without loading the ledger", async () => {
  stub();
  render(
    await List({
      searchParams: Promise.resolve({
        status: ["pending", "confirmed"],
        from: "2026-02-30",
      }),
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Revisa los filtros.");
  expect(calls).toEqual([["me", null]]);
});

it("reads the requested detail and shows catalog names instead of identifiers", async () => {
  stub();
  render(await Detail({ params }));
  expect(screen.getByRole("heading", { name: "Reembolso" })).toBeVisible();
  expect(screen.getByText("Verificado")).toBeVisible();
  for (const label of ["Caja", "Alimentación", "Mercado", "Familia"])
    expect(screen.getByText(label)).toBeVisible();
  expect(calls).toContainEqual([`transactions/${id}`, id]);
  expect(calls.slice(2).every(([, workspace]) => workspace === id)).toBe(true);
});

const create = {
  mode: "create",
  workspaceId: id,
  nonce: id,
  currencies: { [id]: "COP" },
} as const;
const edit = {
  mode: "edit",
  workspaceId: id,
  nonce: id,
  id,
  etag: '"7"',
  occurredAt: row.occurredAt,
} as const;
const annul = { ...edit, mode: "void" } as const;
function form(fields: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries(fields)) result.set(key, value);
  return result;
}
const metadata = {
  date: "2026-01-03",
  categoryId: id,
  payeeId: id,
  description: " Mercado ",
};
const add = {
  ...metadata,
  type: "expense",
  accountId: id,
  amount: "9007199254740993.01",
};

it("rejects malformed drafts and voids before requiring a session", async () => {
  stub();
  const duplicate = form(add);
  duplicate.append("amount", "1");
  const duplicateTags = form(metadata);
  duplicateTags.append("tagIds", id);
  duplicateTags.append("tagIds", id);
  const file = form(metadata);
  file.set("description", new File(["test"], "desc.txt"));
  for (const [bound, input] of [
    [create, duplicate],
    [create, form({ ...add, amount: "1.001" })],
    [create, form({ ...add, date: "2026-02-30" })],
    [edit, duplicateTags],
    [edit, file],
    [annul, form({ reason: "Duplicada" })],
    [annul, form({ reason: "x", confirm: "yes" })],
  ] as const)
    expect(await saveTransactionAction(bound, null, input)).toBe(
      "Revisa los datos de la transacción.",
    );
  expect(requireSession).not.toHaveBeenCalled();
  expect(calls).toEqual([]);
});

it("writes exact normalized drafts with verified scope, version checks and retry keys", async () => {
  const writes: {
    path: string;
    method: string;
    key: string | null;
    match: string | null;
    body: unknown;
  }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (url.endsWith("/v1/me")) return Response.json({ id });
    if (url.endsWith("/v1/workspaces"))
      return Response.json(page([{ id, name: "Casa" }]));
    const headers = new Headers(init.headers);
    expect(headers.get("x-workspace-id")).toBe(id);
    const path = new URL(url).pathname;
    writes.push({
      path,
      method: init.method!,
      key: headers.get("idempotency-key"),
      match: headers.get("if-match"),
      body: JSON.parse(String(init.body)),
    });
    return new Response(null, {
      status: path.endsWith("/transactions") ? 503 : 412,
    });
  });
  const wrongWorkspace = {
    ...create,
    workspaceId: "80000000-0000-4000-8000-000000000002",
  };
  expect(await saveTransactionAction(wrongWorkspace, null, form(add))).toBe(
    "El espacio activo cambió. Vuelve a Transacciones.",
  );
  expect(writes).toEqual([]);
  for (const [amount, description] of [
    [add.amount, " Mercado "],
    [add.amount.replace(".", ","), "Mercado"],
    ["12.34", "Mercado"],
  ]) {
    const draft = form({
      ...add,
      amount,
      description,
      workspaceId: wrongWorkspace.workspaceId,
    });
    draft.append("tagIds", id);
    expect(await saveTransactionAction(create, null, draft)).toBe(
      "No pudimos guardar la transacción. Vuelve a intentarlo.",
    );
  }
  const conflict =
    "La transacción cambió. Recarga la página antes de volver a intentarlo.";
  expect(await saveTransactionAction(edit, null, form(metadata))).toBe(
    conflict,
  );
  expect(
    await saveTransactionAction(
      annul,
      null,
      form({ reason: " Duplicada ", confirm: "yes" }),
    ),
  ).toBe(conflict);
  expect(writes[0]).toMatchObject({
    path: "/savia/v1/transactions",
    method: "POST",
    match: null,
    body: {
      type: "expense",
      accountId: id,
      amount: { amountMinor: "900719925474099301", currency: "COP" },
      occurredAt: "2026-01-03T00:00:00.000Z",
      categoryId: id,
      payeeId: id,
      description: "Mercado",
      tagIds: [id],
    },
  });
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[2].key).not.toBe(writes[0].key);
  expect(writes[3]).toMatchObject({
    path: `/savia/v1/transactions/${id}`,
    method: "PATCH",
    match: '"7"',
    body: {
      occurredAt: row.occurredAt,
      categoryId: id,
      payeeId: id,
      description: "Mercado",
      tagIds: [],
    },
  });
  expect(writes[4]).toMatchObject({
    path: `/savia/v1/transactions/${id}/void`,
    method: "POST",
    match: '"7"',
    body: { reason: "Duplicada" },
  });
  for (const write of writes) expect(write.key).toMatch(/^[\da-f-]{36}$/);
});
