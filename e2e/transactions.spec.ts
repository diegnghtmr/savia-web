import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("filters ledger pages and opens transaction detail", async ({ page }) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page
    .getByRole("link", { name: "Transacciones" })
    .click({ timeout: 3000 });
  await page
    .getByLabel("Cuenta", { exact: true })
    .selectOption({ label: "Caja" });
  await page.getByLabel("Categoría").selectOption({ label: "Alimentación" });
  await page.getByLabel("Desde").fill("2026-01-01");
  await page.getByLabel("Hasta").fill("2026-01-31");
  await page.getByLabel("Estado").selectOption("confirmed");
  await page.getByLabel("Buscar").fill("Mercado");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(
    page.getByRole("link", { name: "Mercado de hoy" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Siguiente" }).click();
  await expect(page.getByLabel("Buscar")).toHaveValue("Mercado");
  await page.getByRole("link", { name: "Mercado anterior" }).click();
  await expect(
    page.getByRole("heading", { name: "Mercado anterior" }),
  ).toBeVisible();
  await expect(page.getByText("Familia", { exact: true })).toBeVisible();
  await expect(page.getByText("Pago en efectivo")).toBeVisible();
  for (const query of ["status=pending&status=confirmed", "cursor=invalid"]) {
    await page.goto(`/transactions?${query}`);
    await expect(page.getByText("Revisa los filtros.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Mercado/ })).toHaveCount(0);
  }
});
