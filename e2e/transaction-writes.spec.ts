import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("creates, edits and voids, rejecting a stale edit", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/transactions");
  await page
    .getByRole("link", { name: "Nueva transacción" })
    .click({ timeout: 3000 });
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Tipo").selectOption("expense");
  await page
    .getByLabel("Cuenta", { exact: true })
    .selectOption({ label: "Caja (COP)" });
  await page.getByLabel("Importe").fill("9007199254740993.01");
  await page.getByLabel("Fecha (UTC)").fill("2026-01-14");
  await page.getByLabel("Categoría").selectOption({ label: "Alimentación" });
  await page.getByLabel("Beneficiario").selectOption({ label: "Mercado" });
  await page.getByLabel("Etiquetas").selectOption({ label: "Familia" });
  await page.getByLabel("Descripción").fill("Compra nueva");
  await page.getByRole("button", { name: "Crear transacción" }).click();
  await expect(
    page.getByRole("heading", { name: "Compra nueva" }),
  ).toBeVisible();
  await expect(
    page.getByText(/COP\s9\.007\.199\.254\.740\.993,01/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Editar transacción" }).click();
  await expect(page.getByLabel("Descripción")).toBeVisible();
  const stale = await context.newPage();
  await stale.goto(page.url(), { waitUntil: "networkidle" });
  await page.getByLabel("Descripción").fill("Compra actualizada");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("heading", { name: "Compra actualizada" }),
  ).toBeVisible();
  await stale.getByLabel("Descripción").fill("No guardar");
  await stale.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    stale.getByText(
      "La transacción cambió. Recarga la página antes de volver a intentarlo.",
    ),
  ).toBeVisible();
  await page.getByLabel("Motivo de anulación").fill("Registro duplicado");
  await page.getByLabel("Confirmo la anulación").check();
  await page.getByRole("button", { name: "Anular transacción" }).click();
  await expect(page.getByText(/Anulada/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Anulada/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Editar transacción" }),
  ).toHaveCount(0);
});

test("a confirmed create lets the user submit a fresh identical transaction", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  const paths: string[] = [];
  for (let index = 0; index < 2; index++) {
    await page.goto("/transactions/new", { waitUntil: "networkidle" });
    await page.getByLabel("Tipo").selectOption("expense");
    await page
      .getByLabel("Cuenta", { exact: true })
      .selectOption({ label: "Caja (COP)" });
    await page.getByLabel("Importe").fill("32,10");
    await page.getByLabel("Fecha (UTC)").fill("2026-01-12");
    await page.getByLabel("Descripción").fill("Dos compras idénticas");
    await page.getByRole("button", { name: "Crear transacción" }).click();
    await expect(
      page.getByRole("heading", { name: "Dos compras idénticas" }),
    ).toBeVisible();
    paths.push(page.url());
  }
  expect(paths[1]).not.toBe(paths[0]);
});
