import { expect, type Page } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test.use({ javaScriptEnabled: false });

async function submit(
  page: Page,
  label: string,
  name: string,
  category = false,
) {
  const form = page.getByRole("form", { name: label });
  const enter = async () => {
    await form.getByLabel("Nombre", { exact: true }).fill(name);
    if (category) {
      await form.getByLabel("Tipo").selectOption("expense");
      await form.getByLabel("Esencial", { exact: true }).check();
    }
  };
  await enter();
  await form.getByRole("button", { name: label }).click();
  const confirm = form.getByRole("button", { name: "Confirmar envío" });
  await expect(confirm).toBeVisible();
  await enter();
  await confirm.click();
}

test("creates catalog entries without JavaScript", async ({ page }) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/transactions");
  await page.getByRole("link", { name: "Catálogos" }).click();
  for (const [label, name, category] of [
    ["Crear categoría", "Catálogo comida", true],
    ["Crear beneficiario", "Catálogo mercado", false],
    ["Crear etiqueta", "Catálogo viaje", false],
  ] as const) {
    await submit(page, label, name, category);
    await expect(page).toHaveURL(/\/catalogs\?guardado=[\da-f-]{36}$/);
    await expect(page.getByText("Solicitud completada.")).toBeVisible();
    const acknowledge = page.getByRole("button", {
      name: "Reconocer operación",
    });
    await acknowledge.click();
    await expect(acknowledge).toHaveCount(0);
  }
  await submit(page, "Crear etiqueta", "CATÁLOGO VIAJE");
  await expect(page.getByRole("alert")).toHaveText(
    "Ya existe un elemento con ese nombre en este espacio.",
  );
  await page.getByRole("link", { name: "Volver a Transacciones" }).click();
  await page.getByRole("link", { name: "Nueva transacción" }).click();
  for (const name of [
    "Catálogo comida",
    "Catálogo mercado",
    "Catálogo viaje",
  ]) {
    const option = page.getByRole("option", { name, exact: true });
    await expect(option).toHaveCount(1);
  }
});
