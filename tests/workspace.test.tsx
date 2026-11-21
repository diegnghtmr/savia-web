import { render, screen } from "@testing-library/react";
import { cookies } from "next/headers";
import OverviewPage from "@/app/(workspace)/overview/page";
import { selectWorkspace } from "@/app/_actions/workspace";
import { requireSession } from "@/lib/session";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

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
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(store.set).not.toHaveBeenCalled();
  },
);
