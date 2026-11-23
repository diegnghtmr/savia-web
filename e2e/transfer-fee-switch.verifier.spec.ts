// Reviewer regression (verify mwtr6nxw). Add as e2e/transfer-fee-switch.verifier.spec.ts.
import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("does not submit a currency exchange while displaying an uncharged fee", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  for (const [name, currency] of [
    ["Destino COP", "COP"],
    ["Destino USD", "USD"],
  ]) {
    await page.goto("/accounts", { waitUntil: "networkidle" });
    await page.getByLabel("Nombre de la cuenta").fill(name);
    await page.getByLabel("Moneda").fill(currency);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }

  await page.goto("/transfers", { waitUntil: "networkidle" });
  const origin = page.getByLabel("Cuenta de origen");
  await origin.selectOption({ label: "Caja (COP)" });
  const destination = page.getByLabel("Cuenta de destino");
  await destination.selectOption({ label: "Destino COP (COP)" });
  const fee = page.getByLabel("Comisión");
  await fee.fill("1500,00");
  await destination.selectOption({ label: "Destino USD (USD)" });
  await page.getByLabel("Importe de origen").fill("50000,00");
  await page.getByLabel("Importe recibido").fill("12.50");
  await page.getByLabel("Tasa ejecutada").fill("0.00025");
  await page.getByLabel("Fecha (UTC)").fill("2026-11-20");

  const submit = page.getByRole("button", { name: "Registrar transferencia" });
  if ((await fee.inputValue()) !== "" && (await submit.isEnabled())) {
    await submit.click();
    const message = "Transferencia registrada.";
    const success = page.getByText(message, { exact: true });
    const alerts = page.locator("main").getByRole("alert");
    const alert = alerts.filter({ hasText: /comisión/i });
    await expect(success.or(alert)).toBeVisible();
    await expect(success).toHaveCount(0);
  }
  await expect(fee).toBeDisabled();
  await expect(fee).toHaveValue("");
  await destination.selectOption({ label: "Destino COP (COP)" });
  await expect(fee).toBeEnabled();
  await expect(fee).toHaveValue("");
});
