import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("reviews and commits a statement", async ({ page }) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/imports");
  await page.getByLabel("Archivo").setInputFiles({
    name: "statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("date,amount,description\n2026-01-01,-12345,Lunch"),
  });
  await page.getByRole("button", { name: "Analizar extracto" }).click();
  await page.getByRole("link", { name: "Ver revisión" }).click();
  await expect(
    page.getByRole("heading", { name: "Vista previa" }),
  ).toBeVisible();
  await expect(page.getByText("Válidas: 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Duplicadas: 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Con errores: 1", { exact: true })).toBeVisible();
  await page.getByLabel("Cuenta de destino").selectOption({ label: "Caja" });
  await page.getByLabel("Confirmo la importación").check();
  await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}$/);
  const jobUrl = page.url();
  await page.getByRole("button", { name: "Importar movimientos" }).click();
  const completed = page.getByText("Importación completada.", { exact: true });
  await expect(completed).toBeVisible();
  await expect(page).toHaveURL(jobUrl);
  await page.reload();
  await expect(completed).toBeVisible();
});

test("polls OCR and opens the linked transaction", async ({ page }) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/receipts");
  await page.getByLabel("Archivo").setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nloopback OCR fixture"),
  });
  await page.getByRole("button", { name: "Enviar a OCR" }).click();
  await page.getByRole("link", { name: "Ver revisión" }).click();
  await expect(page.getByText("Procesando comprobante…")).toBeVisible();
  await expect(page.getByLabel("Importe")).toHaveValue("123.45");
  await page
    .getByLabel("Cuenta de origen")
    .selectOption({ label: "Caja (COP)" });
  await page.getByLabel("Confirmo el gasto").check();
  await page.getByRole("button", { name: "Crear transacción" }).click();
  const view = page.getByRole("link", { name: "Ver transacción" });
  await expect(view).toHaveAttribute("href", /\/transactions\/[0-9a-f-]{36}$/);
  await page.reload();
  await page.getByRole("link", { name: "Ver transacción" }).click();
  await expect(page.getByRole("heading", { name: "Tienda" })).toBeVisible();
});

test("runs reports, exports CSV and handles backup jobs", async ({ page }) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/reports");
  await page.getByLabel("Nombre del informe").fill("Gastos por mes");
  await page.getByRole("button", { name: "Guardar informe" }).click();
  await page.getByRole("link", { name: "Ver informes" }).click();
  const definition = page.getByRole("heading", { name: "Gastos por mes" });
  await expect(definition).toBeVisible();
  await page.getByRole("button", { name: "Ejecutar Gastos por mes" }).click();
  await page.getByRole("link", { name: "Ver ejecución" }).click();
  const download = page.getByRole("link", { name: "Descargar archivo" });
  const signed = /^https:\/\/storage\.example\.test\//;
  await expect(download).toHaveAttribute("href", signed);
  await page.goto("/reports");
  await page.getByRole("button", { name: "Exportar transacciones" }).click();
  await page.getByRole("link", { name: "Ver exportación" }).click();
  await expect(download).toBeVisible();
  await page.goto("/reports");
  await page.getByRole("button", { name: "Crear respaldo completo" }).click();
  await expect(
    page.getByText("Respaldo completo no disponible."),
  ).toBeVisible();
  await page.goto("/overview");
  await page.getByLabel("Espacio activo").selectOption({ label: "Oficina" });
  await page.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(page.getByRole("heading", { name: "Oficina" })).toBeVisible();
  await page.goto("/reports");
  await page.getByRole("button", { name: "Crear respaldo completo" }).click();
  await page.getByRole("link", { name: "Ver respaldo" }).click();
  const backup = page.getByRole("heading", { name: "Respaldo completo" });
  await expect(backup).toBeVisible();
  await expect(download).toBeVisible();
});
