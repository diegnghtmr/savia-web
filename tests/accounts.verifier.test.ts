// Reviewer regression for W2 (verify task mwr14927). Add to tests/ and to the test:server list.
import { createHash } from "node:crypto";
import {
  changeAccountAction,
  createAccountAction,
} from "@/app/_actions/accounts";
import { money } from "@/lib/account-money";
import { requireSession } from "@/lib/session";

const workspaceId = "80000000-0000-4000-8000-000000000001";
const accountId = "80000000-0000-4000-8000-000000000002";
const closeKey = "80000000-0000-4000-8000-000000000003";
const other = "80000000-0000-4000-8000-000000000004";
const bound = { accountId, workspaceId, etag: '"11"' };
const { cookieWrites } = vi.hoisted(() => ({ cookieWrites: vi.fn() }));
const fetchImpl = vi.fn<typeof fetch>();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: other }), set: cookieWrites }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-test-only");
  vi.mocked(requireSession).mockResolvedValue({
    kind: "present",
    accessToken: "probe",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function form(fields: Record<string, string>) {
  const result = new FormData();
  for (const [name, value] of Object.entries(fields)) result.set(name, value);
  return result;
}

function scope(url: string) {
  if (url.endsWith("/v1/me")) return Response.json({ id: accountId });
  if (!url.endsWith("/v1/workspaces"))
    throw Error(`Unexpected request: ${url}`);
  return Response.json({
    items: [{ id: workspaceId, name: "Casa" }],
    pageInfo: { hasNextPage: false },
  });
}

it("passes an explicitly entered opening amount and date without float conversion", async () => {
  const data = form({
    name: "Inicial",
    type: "cash",
    currency: "COP",
    openingBalance: "1234.56",
    openingBalanceDate: "2026-11-20",
  });
  fetchImpl.mockImplementation(async (url, init) =>
    init?.method === "POST"
      ? Response.json({ id: accountId }, { status: 201 })
      : scope(String(url)),
  );
  await expect(
    createAccountAction({ nonce: closeKey, workspaceId }, null, data),
  ).rejects.toThrow("redirect:/accounts");
  const post = fetchImpl.mock.calls.find(([, init]) => init?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
    openingBalance: { amountMinor: "123456", currency: "COP" },
    openingBalanceDate: "2026-11-20",
  });
});

it("does not enter the session or write cookies for File and repeated action fields", async () => {
  const create = form({ name: "Caja", type: "cash", currency: "COP" });
  create.set("name", new File(["Caja"], "name.txt"));
  const edit = form({
    name: "Caja",
    institution: "",
    maskedNumber: "",
    description: "",
    includeInNetWorth: "true",
    status: "archived",
  });
  edit.append("includeInNetWorth", "false");
  const close = form({ confirm: "yes" });
  close.append("confirm", "yes");

  await expect(
    createAccountAction({ nonce: closeKey, workspaceId }, null, create),
  ).resolves.toBe("Revisa el nombre, el tipo y la moneda.");
  await expect(changeAccountAction(bound, null, edit)).resolves.toBe(
    "Revisa los datos de la cuenta.",
  );
  await expect(
    changeAccountAction({ ...bound, closeKey }, null, close),
  ).resolves.toBe("Confirma el cierre de la cuenta.");
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(cookieWrites).not.toHaveBeenCalled();
});

it("replays a committed close when the response is lost", async () => {
  const account = { id: accountId, version: 11, status: "active" };
  const hash = () =>
    createHash("sha256").update(JSON.stringify(account)).digest("hex");
  const requests: Array<[string | null, string | null, string | null]> = [];
  let committedKey: string | null = null;
  fetchImpl.mockImplementation(async (url, init) => {
    if (!String(url).endsWith(`/v1/accounts/${accountId}/close`))
      return scope(String(url));
    const headers = new Headers(init?.headers);
    const key = headers.get("idempotency-key");
    requests.push([
      key,
      headers.get("if-match"),
      headers.get("x-workspace-id"),
    ]);
    if (committedKey === key) return Response.json(account);
    if (account.status === "closed") return new Response(null, { status: 409 });
    committedKey = key;
    account.version++;
    account.status = "closed";
    throw Error("response lost after commit");
  });

  const submission = { ...bound, closeKey };
  const confirmation = form({ confirm: "yes", workspaceId: other });
  await expect(
    changeAccountAction(submission, null, confirmation),
  ).resolves.toBe("No pudimos guardar el cambio. Vuelve a intentarlo.");
  expect(account).toMatchObject({ version: 12, status: "closed" });
  const committed = hash();
  await expect(
    changeAccountAction(submission, null, confirmation),
  ).rejects.toThrow(`redirect:/accounts/${accountId}`);
  expect(hash()).toBe(committed);
  expect(requests).toEqual([
    [closeKey, '"11"', workspaceId],
    [closeKey, '"11"', workspaceId],
  ]);
});

it("formats binary-inexact values and zero/three-decimal currencies exactly", () => {
  expect(money({ amountMinor: "-9007199254740993", currency: "JPY" })).toBe(
    "−JPY 9.007.199.254.740.993",
  );
  expect(money({ amountMinor: "-1234567", currency: "KWD" })).toBe(
    "−KWD 1.234,567",
  );
  expect(money({ amountMinor: "0", currency: "COP" })).toBe("COP 0,00");
});
