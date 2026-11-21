import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("lists and creates accounts in the active workspace", async ({ page }) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.getByRole("link", { name: "Cuentas" }).click();
  await expect(page).toHaveURL("/accounts");
  await expect(page.getByRole("heading", { name: "Caja" })).toBeVisible();
  await expect(page.getByText(/Saldo confirmado:.*COP/)).toBeVisible();
  await page.getByLabel("Estado").selectOption("archived");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("No hay cuentas en esta página.")).toBeVisible();
  await page.getByLabel("Nombre de la cuenta").fill("Vacaciones");
  await page.getByLabel("Tipo de cuenta").selectOption("savings");
  await page.getByLabel("Moneda").fill("COP");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL("/accounts");
  await expect(page.getByRole("heading", { name: "Vacaciones" })).toBeVisible();
});
