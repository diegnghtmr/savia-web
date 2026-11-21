import { render, screen } from "@testing-library/react";
import { cookies } from "next/headers";
import OverviewPage from "@/app/(workspace)/overview/page";
import {
  createWorkspaceAction,
  selectWorkspace,
} from "@/app/_actions/workspace";
import { requireSession } from "@/lib/session";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/profile-gateway", () => ({
  getCurrentUser: async () => ({ kind: "onboarded" }),
}));

const casa = { id: "01ec0000-0000-4000-9000-000000000001", name: "Casa" };
const oficina = { id: "01ec0000-0000-4000-9000-000000000002", name: "Oficina" };
const listUrl = "https://backend.test/savia/v1/workspaces";
const fetchImpl = vi.fn<typeof fetch>();
const store = { get: vi.fn(), set: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test/savia");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "test-only");
  vi.mocked(cookies).mockResolvedValue(
    store as unknown as Awaited<ReturnType<typeof cookies>>,
  );
  vi.mocked(requireSession).mockResolvedValue({
    kind: "present",
    accessToken: "test-token",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const page = (items: unknown[], nextCursor?: string) =>
  Response.json({ items, pageInfo: { hasNextPage: !!nextCursor, nextCursor } });

async function choose(id: string) {
  const form = new FormData();
  form.set("workspaceId", id);
  return selectWorkspace(null, form);
}

it("loads every list page server-side and shows the saved workspace name", async () => {
  store.get.mockReturnValue({ value: oficina.id });
  fetchImpl
    .mockResolvedValueOnce(page([casa], "next/1"))
    .mockResolvedValueOnce(page([oficina]));
  render(await OverviewPage());

  expect(screen.getByRole("heading", { name: "Oficina" })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Espacio activo" })).toHaveValue(
    oficina.id,
  );
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl).toHaveBeenNthCalledWith(1, listUrl, {
    method: "GET",
    cache: "no-store",
    headers: {
      authorization: "Bearer test-token",
      accept: "application/json",
    },
  });
  expect(fetchImpl.mock.calls[1][0]).toBe(`${listUrl}?cursor=next%2F1`);
  expect(store.set).not.toHaveBeenCalled();
});

it("ignores a saved workspace that is no longer in the membership list", async () => {
  store.get.mockReturnValue({ value: oficina.id });
  fetchImpl.mockResolvedValueOnce(page([casa]));
  render(await OverviewPage());
  expect(screen.getByRole("heading", { name: "Casa" })).toBeVisible();
  expect(screen.queryByText("Oficina")).not.toBeInTheDocument();
  expect(store.set).not.toHaveBeenCalled();
});

it("only persists the workspace once the backend has confirmed membership", async () => {
  vi.stubEnv("NODE_ENV", "production");
  fetchImpl.mockResolvedValueOnce(page([casa]));
  await expect(choose(casa.id)).rejects.toThrow("redirect:/overview");
  expect(fetchImpl).toHaveBeenCalledBefore(store.set);
  expect(store.set).toHaveBeenCalledExactlyOnceWith(
    "savia-workspace",
    casa.id,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    },
  );
});

it("rejects a UUID outside the API's membership list without changing the cookie", async () => {
  fetchImpl.mockResolvedValueOnce(page([casa]));
  await expect(choose(oficina.id)).resolves.toBe(
    "Este espacio ya no está disponible.",
  );
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(store.set).not.toHaveBeenCalled();
});

it.each([{ ids: [] }, { ids: [casa.id, oficina.id] }])(
  "rejects ambiguous or missing workspace ids before querying memberships",
  async ({ ids }) => {
    const form = new FormData();
    for (const id of ids) form.append("workspaceId", id);
    fetchImpl.mockResolvedValueOnce(page([casa]));
    await expect(selectWorkspace(null, form)).resolves.toBe(
      "Este espacio ya no está disponible.",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  },
);

it("redirects an API-rejected session without storing the submitted id", async () => {
  fetchImpl.mockResolvedValueOnce(new Response(null, { status: 401 }));
  await expect(choose(casa.id)).rejects.toThrow("redirect:/sign-in");
  expect(store.set).not.toHaveBeenCalled();
});

it.each([
  [() => page([]), "No tienes espacios disponibles."],
  [
    () => new Response(null, { status: 503 }),
    "No pudimos cargar tus espacios.",
  ],
])(
  "distinguishes a successful empty list from a service failure",
  async (response, message) => {
    fetchImpl.mockResolvedValueOnce(response());
    render(await OverviewPage());
    expect(screen.getByText(message)).toBeVisible();
    const recovery = screen.queryByRole("button", { name: "Crear espacio" });
    if (message === "No tienes espacios disponibles.") {
      expect(recovery).toBeVisible();
      expect(
        screen.getByRole("textbox", { name: "Nombre del espacio" }),
      ).toBeRequired();
      expect(
        screen.getByRole("textbox", { name: "Moneda base" }),
      ).toBeRequired();
    } else {
      expect(recovery).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(store.set).not.toHaveBeenCalled();
  },
);

const nonce = "80000000-0000-4000-8000-000000000001";
function recover(name = " Casa ", currency = "cop") {
  const form = new FormData();
  form.set("name", name);
  form.set("baseCurrency", currency);
  return createWorkspaceAction(nonce, null, form);
}

it("reuses a UUID for normalized retries and selects only after membership is confirmed", async () => {
  fetchImpl
    .mockRejectedValueOnce(new Error("lost response"))
    .mockResolvedValueOnce(Response.json(casa, { status: 201 }))
    .mockResolvedValueOnce(page([casa]));

  await expect(recover()).resolves.toBe(
    "No pudimos crear el espacio. Vuelve a intentarlo.",
  );
  expect(store.set).not.toHaveBeenCalled();
  await expect(recover("Casa", "COP")).rejects.toThrow("redirect:/overview");
  const [url, request] = fetchImpl.mock.calls[0];
  expect(url).toBe(listUrl);
  expect(request?.method).toBe("POST");
  const headers = new Headers(request?.headers);
  expect(headers.get("authorization")).toBe("Bearer test-token");
  expect(headers.get("idempotency-key")).toMatch(
    /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/,
  );
  expect(request?.body).toBe('{"name":"Casa","baseCurrency":"COP"}');
  expect(fetchImpl.mock.calls[1]).toEqual(fetchImpl.mock.calls[0]);
  expect(fetchImpl.mock.calls[2][1]?.method).toBe("GET");
  expect(fetchImpl.mock.invocationCallOrder[2]).toBeLessThan(
    store.set.mock.invocationCallOrder[0],
  );
  expect(store.set).toHaveBeenCalledExactlyOnceWith(
    "savia-workspace",
    casa.id,
    expect.objectContaining({ httpOnly: true }),
  );
});

it("uses a new key when the draft changes and never saves unconfirmed membership", async () => {
  fetchImpl
    .mockResolvedValueOnce(Response.json(casa, { status: 201 }))
    .mockResolvedValueOnce(page([]))
    .mockResolvedValueOnce(new Response(null, { status: 422 }));
  await expect(recover()).resolves.toBe("Este espacio ya no está disponible.");
  await expect(recover("Oficina")).resolves.toBe(
    "No pudimos crear el espacio. Vuelve a intentarlo.",
  );
  const key = (index: number) =>
    new Headers(fetchImpl.mock.calls[index][1]?.headers).get("idempotency-key");
  expect(key(0)).not.toBe(key(2));
  expect(store.set).not.toHaveBeenCalled();
});

it("rejects an invalid draft without writing a workspace or cookie", async () => {
  await expect(recover(" ", "12")).resolves.toBe(
    "Revisa el nombre y la moneda base del espacio.",
  );
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(store.set).not.toHaveBeenCalled();
});

it.each([
  ["two names", (form: FormData) => form.append("name", "Oficina")],
  ["two currencies", (form: FormData) => form.append("baseCurrency", "USD")],
  [
    "a file name",
    (form: FormData) => form.set("name", new File(["x"], "x.txt")),
  ],
  [
    "a file currency",
    (form: FormData) => form.set("baseCurrency", new File(["x"], "c")),
  ],
])("rejects a draft with %s before any request", async (_label, tamper) => {
  const form = new FormData();
  form.set("name", "Casa");
  form.set("baseCurrency", "COP");
  tamper(form);
  await expect(createWorkspaceAction(nonce, null, form)).resolves.toBe(
    "Revisa el nombre y la moneda base del espacio.",
  );
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(store.set).not.toHaveBeenCalled();
});
