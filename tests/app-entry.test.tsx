import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import Layout from "@/app/(workspace)/layout";
import { signInAction, signUpAction } from "@/app/_actions/auth";
import { signIn, signUp } from "@/lib/auth-gateway";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
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

async function appEntry() {
  return Layout({ children: <h1>Vista general</h1> });
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
  fetchImpl.mockResolvedValue(Response.json({ id: "profile-id" }));
  render(await appEntry());

  expect(screen.getByRole("heading", { name: "Vista general" })).toBeVisible();
  expect(redirect).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
    "https://backend.test/savia/v1/me",
    {
      method: "GET",
      cache: "no-store",
      headers: {
        authorization: "Bearer test-token",
        accept: "application/json",
      },
    },
  );
});

it.each([
  [404, "/onboarding"],
  [401, "/sign-in"],
])("routes profile status %s to %s", async (status, path) => {
  fetchImpl.mockResolvedValue(new Response(null, { status }));
  await expect(appEntry()).rejects.toThrow(`redirect:${path}`);
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
  },
);
