import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("refreshes a stale approval and supports native decisions", async ({
  page,
  browser,
  baseURL,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await expect(page.getByRole("heading", { name: "Casa" })).toBeVisible();
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
    javaScriptEnabled: false,
    baseURL,
  });
  context.setDefaultTimeout(5000);
  try {
    const form = await context.newPage();
    await form.goto("/approvals");
    await form.getByRole("link", { name: "Registrar gasto" }).click();
    await expect(form.getByText(/Propuesta original/)).toBeVisible();
    await form.getByRole("button", { name: "Aprobar propuesta" }).click();
    await form.getByRole("button", { name: "Confirmar envío" }).click();
    await expect(form).toHaveURL(/\?actualizada=1$/);
    await expect(form.locator("main").getByRole("alert")).toContainText(
      "La propuesta cambió.",
    );
    await expect(form.getByText(/Propuesta actualizada/)).toBeVisible();
    await form.getByRole("button", { name: "Rechazar propuesta" }).click();
    const reject = form.getByRole("form", { name: "Rechazar propuesta" });
    await reject.getByRole("button", { name: "Confirmar envío" }).click();
    await expect(form.getByText("rejected", { exact: true })).toBeVisible();
    await form.getByRole("link", { name: "Volver a propuestas" }).click();
    const empty = form.getByText("No tienes propuestas pendientes.");
    await expect(empty).toBeVisible();
  } finally {
    await context.close();
  }
});

test("gives a native receipt without returning the credential", async ({
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
    const form = await context.newPage();
    const secret = "offline-fixture-slate-1234";
    await form.goto("/ai-credentials");
    await form.getByLabel("Clave del proveedor").fill(secret);
    await form.getByRole("button", { name: "Agregar clave" }).click();
    await expect(form.getByLabel("Clave del proveedor")).toHaveValue("");
    expect(await form.content()).not.toContain(secret);
    await form.getByLabel("Clave del proveedor").fill(secret);
    await form.getByRole("button", { name: "Confirmar envío" }).click();
    await form.getByRole("link", { name: "Continuar" }).click();
    const masked = form.getByRole("heading", { name: "openai · ••••1234" });
    await expect(masked).toBeVisible();
    expect(await form.content()).not.toContain(secret);
  } finally {
    await context.close();
  }
});
