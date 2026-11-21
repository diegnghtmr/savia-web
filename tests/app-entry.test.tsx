import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import OverviewPage from "@/app/(workspace)/overview/page";
import { signInAction, signUpAction } from "@/app/_actions/auth";
import { signIn, signUp } from "@/lib/auth-gateway";
import { getCurrentUser } from "@/lib/profile-gateway";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/auth-gateway", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));

const fetchImpl = vi.fn<typeof fetch>();
const getSession = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test/savia");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "test-only");
  vi.mocked(createServerClient).mockReturnValue({
    auth: { getSession },
  } as unknown as ReturnType<typeof createServerClient>);
  getSession.mockResolvedValue({
    data: { session: { access_token: "test-token" } },
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const profileUrl = "https://backend.test/savia/v1/me";
const workspaceUrl = "https://backend.test/savia/v1/workspaces";
const workspaces = () =>
  Response.json({
    items: [{ id: "80000000-0000-4000-8000-000000000008", name: "Casa" }],
    pageInfo: { hasNextPage: false },
  });

async function appEntry() {
  return OverviewPage();
}

it("sends successful sign-in through the protected overview", async () => {
  vi.mocked(signIn).mockResolvedValue({ kind: "signedIn" });
  const form = new FormData();
  form.set("email", "  example@example.test  ");
  form.set("password", "test-password");

  await expect(signInAction(null, form)).rejects.toThrow("redirect:/overview");
  expect(signIn).toHaveBeenCalledWith({
    email: "example@example.test",
    password: "test-password",
  });
});

it("preserves the auth error without looking up a profile", async () => {
  vi.mocked(signIn).mockResolvedValue({ kind: "invalidCredentials" });
  await expect(signInAction(null, new FormData())).resolves.toEqual({
    kind: "invalidCredentials",
  });
  expect(redirect).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("preserves sign-up with an instant session", async () => {
  vi.mocked(signUp).mockResolvedValue({ kind: "signedIn" });
  await expect(signUpAction(null, new FormData())).rejects.toThrow(
    "redirect:/onboarding",
  );
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("redirects when the session cookie is absent without calling the backend", async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  await expect(appEntry()).rejects.toThrow("redirect:/sign-in");
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("renders the protected overview for an onboarded user", async () => {
  fetchImpl
    .mockResolvedValueOnce(Response.json({ id: "profile-id" }))
    .mockResolvedValueOnce(workspaces());
  render(await appEntry());

  expect(screen.getByRole("heading", { name: "Casa" })).toBeVisible();
  expect(redirect).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenNthCalledWith(1, profileUrl, {
    method: "GET",
    cache: "no-store",
    redirect: "manual",
    headers: {
      authorization: "Bearer test-token",
      accept: "application/json",
    },
  });
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    profileUrl,
    workspaceUrl,
  ]);
});

it("checks the profile again when only the overview page rerenders", async () => {
  fetchImpl.mockImplementation(async (url) => {
    if (url === workspaceUrl) return workspaces();
    return Response.json({ id: "profile-id" });
  });
  const { rerender } = render(await appEntry());
  expect(screen.getByRole("heading", { name: "Casa" })).toBeVisible();
  fetchImpl.mockClear();
  fetchImpl.mockImplementation(async (url) =>
    url === profileUrl ? new Response(null, { status: 503 }) : workspaces(),
  );
  rerender(await appEntry());
  expect(
    screen.getByRole("heading", { name: "No pudimos cargar Savia" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Casa" }),
  ).not.toBeInTheDocument();
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([profileUrl]);
});

it("does not follow a profile redirect whose destination is missing", async () => {
  fetchImpl.mockImplementation(
    async (_url, init) =>
      new Response(
        null,
        init?.redirect === "manual"
          ? { status: 302, headers: { location: "/maintenance" } }
          : { status: 404 },
      ),
  );
  await expect(getCurrentUser("test-token")).resolves.toEqual({
    kind: "failed",
  });
  expect(fetchImpl).toHaveBeenCalledOnce();
});

it.each([
  [404, "/onboarding"],
  [401, "/sign-in"],
])("routes profile status %s to %s", async (status, path) => {
  fetchImpl.mockResolvedValue(new Response(null, { status }));
  await expect(appEntry()).rejects.toThrow(`redirect:${path}`);
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([profileUrl]);
});

it.each([503, 200, "network failure"])(
  "shows a retryable service screen rather than onboarding on %s",
  async (failure) => {
    if (typeof failure === "number") {
      fetchImpl.mockResolvedValue(
        new Response("invalid profile", { status: failure }),
      );
    } else {
      fetchImpl.mockRejectedValue(new Error(failure));
    }
    render(await appEntry());

    expect(
      screen.getByRole("heading", { name: "No pudimos cargar Savia" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Volver a intentar" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Vista general" }),
    ).not.toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([profileUrl]);
  },
);
