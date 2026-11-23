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
  await expect(page.getByRole("heading", { name: "Casa" })).toBeVisible();
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
    javaScriptEnabled: false,
    baseURL,
  });
  context.setDefaultTimeout(5000);
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

    const stale = await context.newPage();
    await stale.goto("/ai-credentials");
    const firstReplacement = "offline-fixture-new-7890";
    const rejected = "offline-fixture-stale-9876";
    for (const [tab, value] of [
      [stale, rejected],
      [form, firstReplacement],
    ] as const) {
      const input = tab.getByLabel("Nueva clave");
      await input.fill(value);
      await tab.getByRole("button", { name: "Reemplazar clave" }).click();
      await expect(input).toHaveValue("");
      expect(await tab.content()).not.toContain(value);
    }
    const updated = { name: "openai · ••••7890" };
    await form.getByLabel("Nueva clave").fill(firstReplacement);
    await form.getByRole("button", { name: "Confirmar envío" }).click();
    await expect(form).toHaveURL(/\/ai-credentials\?guardado=[\da-f-]{36}$/);
    await expect(form.getByRole("heading", updated)).toBeVisible();
    const recognize = form.getByRole("button", { name: "Reconocer operación" });
    await expect(recognize).toBeVisible();
    await expect(form.getByLabel("Nueva clave")).toHaveValue("");
    expect(await form.content()).not.toContain(firstReplacement);
    await recognize.click();
    await expect(recognize).toHaveCount(0);
    await expect(form.getByRole("heading", updated)).toBeVisible();

    await stale.getByLabel("Nueva clave").fill(rejected);
    await stale.getByRole("button", { name: "Confirmar envío" }).click();
    await expect(stale).toHaveURL(/\/ai-credentials\?actualizada=1$/);
    await expect(stale.getByRole("alert")).toContainText(
      "Revisa los datos actualizados.",
    );
    await expect(stale.getByRole("heading", updated)).toBeVisible();
    await expect(stale.getByLabel("Nueva clave")).toHaveValue("");
    expect(await stale.content()).not.toContain(rejected);
  } finally {
    await context.close();
  }
});
