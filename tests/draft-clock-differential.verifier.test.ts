// Reviewer regression (verify mwr9r0b2). Copy to tests/ and add to test:server.
import { recordTransfer } from "@/app/_actions/transfers";
import { admitDraftSeed } from "@/lib/draft-idempotency";
import { prepareDraft } from "@/lib/draft-preparation";

const workspaceId = "80000000-0000-4000-8000-000000000001";
const source = "80000000-0000-4000-8000-000000000002";
const destination = "80000000-0000-4000-8000-000000000003";
const id = "80000000-0000-4000-8000-000000000004";
const warning =
  "Puede que este movimiento ya se haya registrado. Revisa la lista antes de volver a intentarlo.";
let membershipDate: string | undefined;
let jar: Map<string, string>;
const writes: string[] = [];
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: jar.get(name) }),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ accessToken: "offline" }),
}));

beforeEach(async () => {
  jar = new Map();
  writes.length = 0;
  membershipDate = "Fri, 01 May 2026 18:00:00 GMT";
  vi.stubEnv("BACKEND_BASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (path === "/v1/me") return Response.json({ id });
    if (path === "/v1/workspaces")
      return Response.json(
        {
          items: [{ id: workspaceId, name: "Casa" }],
          pageInfo: { hasNextPage: false },
        },
        {
          headers: membershipDate === undefined ? {} : { date: membershipDate },
        },
      );
    expect(path).toBe("/v1/transfers");
    const header = new Headers(init?.headers).get("idempotency-key");
    if (!header) throw new Error("No idempotency header");
    writes.push(header);
    return Response.json({ id }, { status: 201 });
  });
  expect(await admitDraftSeed(workspaceId)).toBe(true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function form() {
  const data = new FormData();
  data.set("sourceAccountId", source);
  data.set("destinationAccountId", destination);
  data.set("date", "2026-05-01");
  data.set("amount", "5");
  return data;
}
const send = (input: FormData) =>
  recordTransfer(
    { workspaceId, currencies: { [source]: "COP", [destination]: "COP" } },
    null,
    input,
  );
const reserve = (input: FormData) => prepareDraft(() => send(input));

it.each([undefined, "Fri, 32 May 2026 18:00:00 GMT"])(
  "can make one explicitly authorized fresh write when membership Date is %s",
  async (badDate) => {
    const initial = form();
    const first = await reserve(initial);
    expect(first.prepared).toEqual(expect.any(String));
    initial.set("draftPrepared", first.prepared!);
    const prior = new Map(jar);
    expect(await send(initial)).toEqual({ receipt: id });
    jar = prior;
    membershipDate = badDate;
    const retry = form();
    const choice = await reserve(retry);
    expect(choice).toEqual({
      state: { error: warning, confirmation: expect.any(String) },
    });
    expect(writes).toHaveLength(1);
    retry.set(
      "confirmDraft",
      (choice.state as { confirmation: string }).confirmation,
    );
    const confirmed = await reserve(retry);
    expect(confirmed).toEqual({ prepared: expect.any(String) });
    expect(writes).toHaveLength(1);
    retry.set("draftPrepared", confirmed.prepared!);
    expect(await send(retry)).toEqual({ receipt: id });
    expect(writes).toHaveLength(2);
    expect(writes[1]).not.toBe(writes[0]);
  },
);
