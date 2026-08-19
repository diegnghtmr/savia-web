import { expect, test } from "@playwright/test";
import { E2E_USER } from "./fixtures";

test.describe("authentication flow", () => {
  test("sign-in sets httpOnly session cookie with zero browser application requests, renders onboarding, and sign-out clears session", async ({
    page,
    context,
  }) => {
    const runtime: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        ["xhr", "fetch", "eventsource", "websocket"].includes(
          request.resourceType(),
        ) &&
        !(
          url.origin === "http://127.0.0.1:3000" && url.searchParams.has("_rsc")
        )
      ) {
        runtime.push(request.url());
      }
    });

    // 1. Navigate to sign-in page
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Iniciar sesión" }),
    ).toBeVisible();

    // 2. Fill credentials and submit
    await page.getByLabel("Correo electrónico").fill(E2E_USER.email);
    await page.getByLabel("Contraseña").fill(E2E_USER.password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    // 3. Verify redirect to /onboarding and it renders
    await expect(page).toHaveURL("/onboarding");
    await expect(
      page.getByRole("heading", { level: 1, name: "Crea tu espacio" }),
    ).toBeVisible();

    // 4. Verify cookie is httpOnly and absent from document.cookie
    const cookies = await context.cookies();
    const authCookies = cookies.filter(
      (c) => c.name.startsWith("sb-") && c.name.includes("auth-token"),
    );
    expect(authCookies.length).toBeGreaterThan(0);
    for (const authCookie of authCookies) {
      expect(authCookie.httpOnly).toBe(true);
      const documentCookie = await page.evaluate(() => document.cookie);
      expect(documentCookie).not.toContain(authCookie.name);
    }

    // 5. Zero browser application requests to backend or auth host
    const nonNextRequests = runtime.filter(
      (url) => !url.startsWith("http://127.0.0.1:3000"),
    );
    expect(nonNextRequests).toEqual([]);

    // 6. Sign out clears session and redirects to /sign-in
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    // Verify navigating back to /onboarding redirects to /sign-in
    await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("sign-up with a new random email yields real confirmationRequired state from service", async ({
    page,
  }) => {
    const randomEmail = `test-user-${Date.now()}-${Math.floor(Math.random() * 10000)}@savia.local`;
    await page.goto("/sign-up", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Crear cuenta" }),
    ).toBeVisible();

    await page.getByLabel("Correo electrónico").fill(randomEmail);
    await page.getByLabel("Contraseña").fill("TestPassword123!");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    // Must render confirmationRequired state, not redirect to /onboarding
    const status = page.getByRole("status");
    await expect(status).toBeVisible();
    await expect(status).toContainText("Revisa tu correo");
    expect(page.url()).toContain("/sign-up");
  });
});
