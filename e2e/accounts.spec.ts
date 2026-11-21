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
  // The GET filter reloads the document; wait for the controlled form to hydrate.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Nombre de la cuenta").fill("Vacaciones");
  await page.getByLabel("Tipo de cuenta").selectOption("savings");
  await page.getByLabel("Moneda").fill("COP");
  await page
    .getByLabel("Saldo inicial (opcional)", { exact: true })
    .fill("9007199254740993.01");
  await page
    .getByLabel("Fecha del saldo inicial (opcional)")
    .fill("2026-11-20");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL("/accounts");
  await expect(page.getByRole("heading", { name: "Vacaciones" })).toBeVisible();
  await expect(
    page.getByText(/Saldo confirmado: COP\s9\.007\.199\.254\.740\.993,01/),
  ).toBeVisible();
});

test("edits, archives and confirms closure from account detail", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.getByRole("link", { name: "Cuentas" }).click();
  await page.getByRole("link", { name: "Caja" }).click({ timeout: 3000 });
  await expect(page.getByText("Saldo pendiente")).toBeVisible();
  await expect(page.getByText("Saldo disponible").locator("+ dd")).toHaveText(
    "No disponible",
  );
  await page.getByLabel("Nombre de la cuenta").fill("Caja familiar");
  await page.getByLabel("Estado").selectOption("archived");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("heading", { name: "Caja familiar" }),
  ).toBeVisible();
  await expect(
    page.getByText("Archivada", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar cuenta" }).click();
  await expect(
    page.getByRole("button", { name: "Cerrar cuenta" }),
  ).toBeVisible();
  await page.getByLabel("Confirmo el cierre de esta cuenta").check();
  await page.getByRole("button", { name: "Cerrar cuenta" }).click();
  await expect(page.getByText("Cerrada", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar cambios" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Cerrada", { exact: true })).toBeVisible();
});
