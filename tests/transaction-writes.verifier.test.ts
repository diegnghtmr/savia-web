// Reviewer regression for W4 (verify mwr38e1a). Copy to tests/ and add to test:server.
import { createHash } from "node:crypto";
import { saveTransactionAction } from "@/app/_actions/transactions";
import { requireSession } from "@/lib/session";

const workspace = "80000000-0000-4000-8000-000000000001";
const account = "80000000-0000-4000-8000-000000000002";
const nonce = "80000000-0000-4000-8000-000000000003";
const tag = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
const otherTag = "80000000-0000-4000-8000-000000000004";
const transaction = "80000000-0000-4000-8000-000000000005";
const create = {
  mode: "create",
  workspaceId: workspace,
  nonce,
  currencies: { [account]: "KWD" },
} as const;
const edit = {
  mode: "edit",
  workspaceId: workspace,
  nonce,
  id: transaction,
  etag: '"7"',
  occurredAt: "2026-11-20T12:00:00Z",
} as const;
const annul = { ...edit, mode: "void" } as const;
const fetchImpl = vi.fn<typeof fetch>();
const { cookieWrites } = vi.hoisted(() => ({ cookieWrites: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: workspace }),
    set: cookieWrites,
  }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    kind: "present",
    accessToken: "offline-probe",
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Error(`redirect:${path}`);
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  fetchImpl.mockReset();
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-test-only");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function draft(fields: Record<string, string> = {}) {
  return form({
    type: "expense",
    accountId: account,
    amount: "17.005",
    date: "2026-11-20",
    description: "Compra",
    ...fields,
  });
}

function membership(url: string) {
  if (url.endsWith("/v1/me")) return Response.json({ id: workspace });
  if (url.endsWith("/v1/workspaces"))
    return Response.json(
      {
        items: [{ id: workspace, name: "Casa" }],
        pageInfo: { hasNextPage: false },
      },
      { headers: { date: "Fri, 20 Nov 2026 12:00:00 GMT" } },
    );
  throw Error(`Unexpected request: ${url}`);
}

it("rejects currency precision, malformed catalog ids and invalid voids without I/O", async () => {
  const yen = { ...create, currencies: { [account]: "JPY" } };
  const repeatedTag = draft();
  repeatedTag.append("tagIds", tag);
  repeatedTag.append("tagIds", tag.toUpperCase());
  const file = draft();
  file.set("categoryId", new File([tag], "category.txt"));
  const repeatedConfirmation = form({ reason: "Duplicado", confirm: "yes" });
  repeatedConfirmation.append("confirm", "yes");

  for (const [bound, input] of [
    [yen, draft({ amount: "1.01" })],
    [create, draft({ amount: "17.0051" })],
    [create, draft({ date: "2026-02-29" })],
    [create, draft({ accountId: tag })],
    [create, draft({ payeeId: "not-a-uuid" })],
    [create, file],
    [create, repeatedTag],
    [edit, form({ date: "2026-11-20", categoryId: "not-a-uuid" })],
    [annul, form({ reason: "Sí", confirm: "yes" })],
    [annul, form({ reason: "x".repeat(501), confirm: "yes" })],
    [annul, repeatedConfirmation],
  ] as const) {
    await expect(saveTransactionAction(bound, null, input)).resolves.toBe(
      "Revisa los datos de la transacción.",
    );
  }
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(cookieWrites).not.toHaveBeenCalled();
});

it("replays the exact KWD draft after the backend commits and loses its reply", async () => {
  const committed = new Map<string, string>();
  const keys: string[] = [];
  const hash = () =>
    createHash("sha256")
      .update(JSON.stringify([...committed]))
      .digest("hex");

  fetchImpl.mockImplementation(async (url, init) => {
    if (init?.method !== "POST") return membership(String(url));
    const headers = new Headers(init.headers);
    expect(headers.get("x-workspace-id")).toBe(workspace);
    const key = headers.get("idempotency-key")!;
    const body = String(init.body);
    keys.push(key);
    const previous = committed.get(key);
    if (previous !== undefined) {
      expect(previous).toBe(body);
      return Response.json({ id: transaction }, { status: 201 });
    }
    committed.set(key, body);
    if (committed.size === 1) throw Error("reply lost after commit");
    return Response.json({ id: transaction }, { status: 201 });
  });

  const first = draft({ workspaceId: otherTag });
  first.append("tagIds", tag);
  first.append("tagIds", otherTag);
  await expect(saveTransactionAction(create, null, first)).resolves.toBe(
    "No pudimos guardar la transacción. Vuelve a intentarlo.",
  );
  expect(committed.size).toBe(1);
  expect(JSON.parse([...committed.values()][0])).toMatchObject({
    amount: { currency: "KWD", amountMinor: "17005" },
    tagIds: [otherTag, tag],
  });
  const before = hash();

  const retry = draft({ amount: "17,005", description: " Compra " });
  retry.append("tagIds", otherTag);
  retry.append("tagIds", tag.toUpperCase());
  await expect(saveTransactionAction(create, null, retry)).rejects.toThrow(
    `redirect:/transactions/${transaction}`,
  );
  expect(keys[1]).toBe(keys[0]);
  expect(hash()).toBe(before);

  retry.set("amount", "17.006");
  await expect(saveTransactionAction(create, null, retry)).rejects.toThrow(
    `redirect:/transactions/${transaction}`,
  );
  expect(keys[2]).not.toBe(keys[0]);
  expect(committed.size).toBe(2);
});

it("sets and clears extraordinary only on a versioned transaction edit", async () => {
  const date = "2026-11-20";
  for (const extra of ["yes", "1"]) {
    await expect(
      saveTransactionAction(edit, null, form({ date, extraordinary: extra })),
    ).resolves.toBe("Revisa los datos de la transacción.");
  }
  const duplicate = form({ date, extraordinary: "true" });
  duplicate.append("extraordinary", "false");
  await expect(saveTransactionAction(edit, null, duplicate)).resolves.toBe(
    "Revisa los datos de la transacción.",
  );
  expect(requireSession).not.toHaveBeenCalled();
  expect(cookieWrites).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();

  const edits: boolean[] = [];
  fetchImpl.mockImplementation(async (url, init) => {
    if (init?.method !== "PATCH") return membership(String(url));
    expect(String(url)).toMatch(`/v1/transactions/${transaction}`);
    expect(new Headers(init.headers).get("if-match")).toBe('"7"');
    edits.push(JSON.parse(String(init.body)).extraordinary);
    return Response.json({ id: transaction });
  });
  for (const extraordinary of ["true", "false"]) {
    await expect(
      saveTransactionAction(edit, null, form({ date, extraordinary })),
    ).rejects.toThrow(`redirect:/transactions/${transaction}`);
  }
  expect(edits).toEqual([true, false]);
});

it("sends the rendered If-Match for edit and void without changing a newer record", async () => {
  const state = {
    version: 8,
    description: "Guardado primero",
    status: "confirmed",
  };
  const hash = () =>
    createHash("sha256").update(JSON.stringify(state)).digest("hex");
  const sent: { match: string | null; body: unknown }[] = [];
  fetchImpl.mockImplementation(async (url, init) => {
    if (!init?.method || init.method === "GET") return membership(String(url));
    const match = new Headers(init.headers).get("if-match");
    sent.push({ match, body: JSON.parse(String(init.body)) });
    if (match !== `"${state.version}"`)
      return new Response(null, { status: 412 });
    Object.assign(state, { description: "No debe guardarse", version: 9 });
    return Response.json({ id: transaction });
  });

  const before = hash();
  const conflict =
    "La transacción cambió. Recarga la página antes de volver a intentarlo.";
  await expect(
    saveTransactionAction(
      edit,
      null,
      form({ date: "2026-11-20", description: "No debe guardarse" }),
    ),
  ).resolves.toBe(conflict);
  expect(hash()).toBe(before);
  await expect(
    saveTransactionAction(
      annul,
      null,
      form({ reason: " Duplicado ", confirm: "yes" }),
    ),
  ).resolves.toBe(conflict);
  expect(hash()).toBe(before);
  expect(sent).toEqual([
    {
      match: '"7"',
      body: {
        occurredAt: edit.occurredAt,
        categoryId: null,
        payeeId: null,
        description: "No debe guardarse",
        tagIds: [],
      },
    },
    { match: '"7"', body: { reason: "Duplicado" } },
  ]);
});
