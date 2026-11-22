import { render, screen } from "@testing-library/react";
import AccountPage from "@/app/(workspace)/accounts/[accountId]/page";
import AccountsPage from "@/app/(workspace)/accounts/page";
import {
  changeAccountAction,
  createAccountAction,
} from "@/app/_actions/accounts";
import { requireSession } from "@/lib/session";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "not-a-member" }) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const id = "80000000-0000-4000-8000-000000000001";
const account = { id, name: "Mi cuenta", status: "active" };
const submission = { nonce: id, workspaceId: id };
const fetchImpl = vi.fn<typeof fetch>();
const page = (items: unknown[], nextCursor?: string) =>
  Response.json({ items, pageInfo: { hasNextPage: !!nextCursor, nextCursor } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test/savia");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-test-only");
  vi.mocked(requireSession).mockResolvedValue({
    kind: "present",
    accessToken: "test-token",
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("stops before account requests when the profile check fails", async () => {
  fetchImpl.mockResolvedValueOnce(new Response(null, { status: 503 }));
  render(await AccountsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText("No pudimos consultar tu perfil.")).toBeVisible();
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    "https://backend.test/savia/v1/me",
  ]);
});

it("queries filtered accounts and balances in the verified workspace", async () => {
  fetchImpl
    .mockResolvedValueOnce(Response.json({ id }))
    .mockResolvedValueOnce(page([{ id, name: "Casa" }]))
    .mockResolvedValueOnce(page([account], "next/2"))
    .mockResolvedValueOnce(
      Response.json({
        accountId: id,
        nativeBalance: { amountMinor: "-900719925474099301", currency: "COP" },
        asOf: "2026-01-01T00:00:00Z",
      }),
    );
  const searchParams = Promise.resolve({
    status: "active",
    cursor: "next/1",
    limit: "3",
  });
  render(await AccountsPage({ searchParams }));
  expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute(
    "href",
    `/accounts/${id}`,
  );
  expect(screen.getByText(/−COP\s9\.007\.199\.254\.740\.993,01/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
    "href",
    "/accounts?status=active&cursor=next%2F2&limit=3",
  );
  const calls = fetchImpl.mock.calls.slice(2);
  expect(calls.map(([url]) => url)).toEqual([
    "https://backend.test/savia/v1/accounts?limit=3&status=active&cursor=next%2F1",
    `https://backend.test/savia/v1/accounts/${id}/balance`,
  ]);
  for (const [, init] of calls)
    expect(new Headers(init?.headers).get("x-workspace-id")).toBe(id);
});

function draft(name = " Ahorros ") {
  const form = new FormData();
  form.set("name", name);
  form.set("type", "savings");
  form.set("currency", "cop");
  form.set("workspaceId", "forged");
  return form;
}

it("rejects ambiguous or missing fields before reading the session", async () => {
  const duplicate = draft();
  duplicate.append("currency", "USD");
  const missing = draft();
  missing.delete("type");
  for (const form of [duplicate, missing]) {
    await expect(createAccountAction(submission, null, form)).resolves.toBe(
      "Revisa el nombre, el tipo y la moneda.",
    );
  }
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it.each([
  { status: ["active", "closed"] },
  { status: "unknown" },
  { cursor: ["one", "two"] },
  { cursor: "" },
  { limit: "0" },
  { limit: "201" },
  { limit: "1.5" },
  { limit: "" },
  { limit: ["1", "2"] },
])(
  "rejects invalid list parameters before querying accounts: %o",
  async (query) => {
    fetchImpl.mockResolvedValueOnce(Response.json({ id }));
    render(await AccountsPage({ searchParams: Promise.resolve(query) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Revisa los filtros.");
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "https://backend.test/savia/v1/me",
    ]);
  },
);

it("rejects invalid opening balance fields before reading the session", async () => {
  const duplicate = draft();
  duplicate.append("openingBalance", "1.00");
  duplicate.append("openingBalance", "2.00");
  const file = draft();
  file.set("openingBalanceDate", new File(["2026-11-20"], "date.txt"));
  for (const [amount, date] of [
    ["1.001", ""],
    ["92233720368547758.08", ""],
    ["1.00", "2026-02-30"],
    ["", "2026-11-20"],
  ]) {
    const form = draft();
    form.set("openingBalance", amount);
    form.set("openingBalanceDate", date);
    await expect(createAccountAction(submission, null, form)).resolves.toBe(
      "Revisa el saldo inicial y su fecha.",
    );
  }
  for (const form of [duplicate, file])
    await expect(createAccountAction(submission, null, form)).resolves.toBe(
      "Revisa el saldo inicial y su fecha.",
    );
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("does not submit a draft after the active workspace changes", async () => {
  fetchImpl.mockResolvedValueOnce(page([{ id, name: "Casa" }]));
  const stale = { ...submission, workspaceId: "changed" };
  await expect(createAccountAction(stale, null, draft())).resolves.toBe(
    "El espacio activo cambió. Vuelve a Cuentas.",
  );
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(fetchImpl.mock.calls[0][1]?.method).toBe("GET");
});

it("uses a verified workspace and a stable UUID on retries", async () => {
  fetchImpl.mockImplementation(async (_url, init) =>
    init?.method === "POST"
      ? new Response(null, { status: 503 })
      : page([{ id, name: "Casa" }]),
  );
  const error = "No pudimos crear la cuenta. Vuelve a intentarlo.";
  for (const name of [" Ahorros ", "Ahorros", "Otra cuenta"]) {
    await expect(
      createAccountAction(submission, null, draft(name)),
    ).resolves.toBe(error);
  }
  const posts = fetchImpl.mock.calls.filter(
    ([, init]) => init?.method === "POST",
  );
  expect(posts).toHaveLength(3);
  expect(posts[0][0]).toBe("https://backend.test/savia/v1/accounts");
  const headers = new Headers(posts[0][1]?.headers);
  expect(headers.get("x-workspace-id")).toBe(id);
  expect(headers.get("idempotency-key")).toMatch(
    /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/,
  );
  expect(posts[0][1]?.body).toBe(
    '{"name":"Ahorros","type":"savings","currency":"COP"}',
  );
  expect(posts[1]).toEqual(posts[0]);
  expect(new Headers(posts[2][1]?.headers).get("idempotency-key")).not.toBe(
    headers.get("idempotency-key"),
  );
});

const params = Promise.resolve({ accountId: id });
const bound = { accountId: id, workspaceId: id, etag: '"7"' };
const close = { ...bound, closeKey: id };
const edit = () => {
  const form = new FormData();
  for (const [field, value] of Object.entries({
    name: " Ahorros ",
    institution: "Banco",
    maskedNumber: "",
    description: "",
    includeInNetWorth: "false",
    status: "archived",
    workspaceId: "forged",
  }))
    form.set(field, value);
  return form;
};
const confirm = () => {
  const form = new FormData();
  form.set("confirm", "yes");
  return form;
};
function profileAndSpace() {
  fetchImpl
    .mockResolvedValueOnce(Response.json({ id }))
    .mockResolvedValueOnce(page([{ id, name: "Casa" }]));
}

it("does not load account detail when the profile check fails", async () => {
  fetchImpl.mockResolvedValueOnce(new Response(null, { status: 503 }));
  render(await AccountPage({ params }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "No pudimos consultar tu perfil.",
  );
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    "https://backend.test/savia/v1/me",
  ]);
});

it("loads account and balance using a canonical account UUID", async () => {
  const accountId = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
  profileAndSpace();
  fetchImpl
    .mockResolvedValueOnce(
      Response.json(
        {
          ...account,
          id: accountId,
          type: "cash",
          currency: "COP",
          includeInNetWorth: true,
        },
        { headers: { etag: '"7"' } },
      ),
    )
    .mockResolvedValueOnce(
      Response.json({
        accountId,
        asOf: "2026-01-01T00:00:00Z",
        nativeBalance: { amountMinor: "0", currency: "COP" },
      }),
    );
  render(
    await AccountPage({
      params: Promise.resolve({ accountId: accountId.toUpperCase() }),
    }),
  );
  expect(screen.getByRole("heading", { name: "Mi cuenta" })).toBeVisible();
  expect(fetchImpl.mock.calls.slice(2).map(([url]) => url)).toEqual([
    `https://backend.test/savia/v1/accounts/${accountId}`,
    `https://backend.test/savia/v1/accounts/${accountId}/balance`,
  ]);
});

it("shows the API balance breakdown, rate and cutoff in verified scope", async () => {
  const usd = { currency: "USD", amountMinor: "-1275" };
  profileAndSpace();
  fetchImpl
    .mockResolvedValueOnce(
      Response.json(
        { ...account, type: "cash", currency: "USD", includeInNetWorth: true },
        { headers: { etag: bound.etag } },
      ),
    )
    .mockResolvedValueOnce(
      Response.json({
        accountId: id,
        nativeBalance: usd,
        pendingBalance: { ...usd, amountMinor: "200" },
        availableBalance: usd,
        reconciledBalance: { ...usd, amountMinor: "-1000" },
        asOf: "2026-01-02T00:00:00Z",
        baseCurrencyEquivalent: {
          converted: { amountMinor: "-5115740", currency: "COP" },
          rate: "4012.345",
          rateDate: "2026-01-01",
          rateSource: "manual",
        },
      }),
    );
  render(await AccountPage({ params }));
  for (const [label, value] of [
    ["Saldo confirmado", "−USD 12,75"],
    ["Saldo pendiente", "USD 2,00"],
    ["Saldo disponible", "−USD 12,75"],
    ["Saldo conciliado", "−USD 10,00"],
    ["Equivalente en moneda base", "≈ −COP 51.157,40"],
  ])
    expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value);
  expect(screen.getByText(/Tasa: /)).toHaveTextContent(
    "Tasa: 4012.345 · 2026-01-01 · Fuente: manual",
  );
  expect(screen.getByText("2026-01-02T00:00:00Z")).toBeVisible();
  expect(
    fetchImpl.mock.calls
      .slice(2)
      .map(([url, init]) => [
        url,
        new Headers(init?.headers).get("x-workspace-id"),
      ]),
  ).toEqual([
    [`https://backend.test/savia/v1/accounts/${id}`, id],
    [`https://backend.test/savia/v1/accounts/${id}/balance`, id],
  ]);
});

it("rejects ambiguous edit fields and unconfirmed closes before session", async () => {
  const duplicate = edit();
  duplicate.append("status", "active");
  const ambiguous = confirm();
  ambiguous.append("confirm", "yes");
  await expect(changeAccountAction(bound, null, duplicate)).resolves.toBe(
    "Revisa los datos de la cuenta.",
  );
  for (const form of [new FormData(), ambiguous])
    await expect(changeAccountAction(close, null, form)).resolves.toBe(
      "Confirma el cierre de la cuenta.",
    );
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("does not mutate an account from a stale workspace or failed profile", async () => {
  profileAndSpace();
  await expect(
    changeAccountAction({ ...bound, workspaceId: "changed" }, null, edit()),
  ).resolves.toBe("El espacio activo cambió. Vuelve a Cuentas.");
  fetchImpl.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(changeAccountAction(close, null, confirm())).resolves.toBe(
    "No pudimos consultar tu perfil.",
  );
  expect(fetchImpl.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(
    ["GET", "GET", "GET"],
  );
});

it("PATCHes metadata with If-Match and closes with a retryable key", async () => {
  for (const [submission, form, status, error] of [
    [
      bound,
      edit(),
      412,
      "La cuenta cambió. Recarga la página antes de volver a intentarlo.",
    ],
    [
      close,
      confirm(),
      503,
      "No pudimos guardar el cambio. Vuelve a intentarlo.",
    ],
    [
      close,
      confirm(),
      503,
      "No pudimos guardar el cambio. Vuelve a intentarlo.",
    ],
  ] as const) {
    profileAndSpace();
    fetchImpl.mockResolvedValueOnce(new Response(null, { status }));
    await expect(changeAccountAction(submission, null, form)).resolves.toBe(
      error,
    );
  }
  const [patch, first, retry] = fetchImpl.mock.calls.filter(
    ([, init]) => init?.method === "PATCH" || init?.method === "POST",
  );
  const endpoint = `https://backend.test/savia/v1/accounts/${id}`;
  expect(patch[0]).toBe(endpoint);
  expect(JSON.parse(String(patch[1]?.body))).toEqual({
    name: "Ahorros",
    institution: "Banco",
    maskedNumber: null,
    description: null,
    status: "archived",
    includeInNetWorth: false,
  });
  expect(first[0]).toBe(`${endpoint}/close`);
  expect(first[1]?.body).toBeUndefined();
  expect(new Headers(first[1]?.headers).get("idempotency-key")).toBe(id);
  expect(retry).toEqual(first);
  for (const [, init] of [patch, first]) {
    const headers = new Headers(init?.headers);
    expect(headers.get("if-match")).toBe(bound.etag);
    expect(headers.get("x-workspace-id")).toBe(id);
  }
});
