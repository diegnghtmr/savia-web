import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { E2E_USER as NOT_ONBOARDED_USER } from "./fixtures";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test.describe("authentication flow", () => {
  test("a not-yet-onboarded user signs in with an httpOnly cookie and no browser API requests", async ({
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
    await page.getByLabel("Correo electrónico").fill(NOT_ONBOARDED_USER.email);
    await page.getByLabel("Contraseña").fill(NOT_ONBOARDED_USER.password);
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
      expect(authCookie).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
      });
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

    // Both protected entry points reject the signed-out session.
    for (const path of ["/onboarding", "/overview"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/sign-in/);
    }
  });

  test("an onboarded user lands on the overview", async ({ page }) => {
    await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
    await expect(page).toHaveURL("/overview");
    await expect(page.getByRole("heading", { name: "Casa" })).toBeVisible();
  });

  test("sign-up prompts for email confirmation", async ({ page }) => {
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
