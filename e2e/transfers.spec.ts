import { expect, type Page } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

async function account(page: Page, name: string, currency: string) {
  await page.goto("/accounts", { waitUntil: "networkidle" });
  await page.getByLabel("Nombre de la cuenta").fill(name);
  await page.getByLabel("Moneda").fill(currency);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("records same-currency and cross-currency transfers", async ({ page }) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await account(page, "Ahorros COP", "COP");
  await account(page, "Ahorros USD", "USD");
  for (const [name, cross] of [
    ["Ahorros COP (COP)", false],
    ["Ahorros USD (USD)", true],
  ] as const) {
    await page.goto("/transfers", { waitUntil: "networkidle" });
    await page
      .getByLabel("Cuenta de origen")
      .selectOption({ label: "Caja (COP)" }, { timeout: 3000 });
    await page.getByLabel("Cuenta de destino").selectOption({ label: name });
    await page.getByLabel("Importe de origen").fill("50000,00");
    await page.getByLabel("Fecha (UTC)").fill("2026-11-20");
    const fee = page.getByLabel("Comisión");
    if (cross) {
      await expect(fee).toBeDisabled({ timeout: 3000 });
      await expect(
        page.getByText(
          "Disponible solo para transferencias en la misma moneda.",
        ),
      ).toBeVisible();
      await page.getByLabel("Importe recibido").fill("12.50");
      await page.getByLabel("Tasa ejecutada").fill("0.00025");
    } else {
      await expect(fee).toBeEnabled({ timeout: 3000 });
      await fee.fill("0,02");
      await expect(page.getByLabel("Importe recibido")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Registrar transferencia" }).click();
    await expect(page.getByText("Transferencia registrada.")).toBeVisible();
  }
});
