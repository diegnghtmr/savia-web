// Reviewer regression (verify mwst8uip). Add as e2e/workspace-picker-progressive.spec.ts.
import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("switches workspaces from the server-rendered picker with JavaScript disabled", async ({
  page,
  browser,
  baseURL,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
    javaScriptEnabled: false,
    baseURL,
  });
  try {
    const withoutScripts = await context.newPage();
    await withoutScripts.goto("/overview");
    await withoutScripts
      .getByLabel("Espacio activo")
      .selectOption({ label: "Oficina" });
    await withoutScripts
      .getByRole("button", { name: "Cambiar de espacio" })
      .click();
    await expect(
      withoutScripts.getByRole("heading", { name: "Oficina", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
