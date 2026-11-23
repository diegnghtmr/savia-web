// Reviewer regression (verify mwtr6nxw). Add as e2e/native-stale-close.verifier.spec.ts.
import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test.use({ javaScriptEnabled: false });

test("keeps the native stale close warning after another tab edits the account", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/accounts");
  const href = await page
    .getByRole("link", { name: "Caja", exact: true })
    .getAttribute("href");
  const stale = await context.newPage();
  await stale.goto(href!);
  await page.goto(href!);
  await page.getByLabel("Nombre de la cuenta").fill("Caja para la casa");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  const heading = { name: "Caja para la casa" };
  await expect(page.getByRole("heading", heading)).toBeVisible();

  const close = stale.getByRole("form", { name: "Cerrar cuenta" });
  await close.getByLabel("Confirmo el cierre de esta cuenta").check();
  await close.getByRole("button", { name: "Cerrar cuenta" }).click();
  await expect(close.getByRole("alert")).toHaveText(
    "La cuenta cambió. Recarga la página antes de volver a intentarlo.",
  );
  await stale.reload();
  await expect(stale.getByRole("heading", heading)).toBeVisible();
  await expect(stale.getByText("Cerrada", { exact: true })).toHaveCount(0);
});
