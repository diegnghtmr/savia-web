import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("shows the verified dashboard and validates the period before loading it", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/overview?from=2026-01-01&to=2026-02-28");
  await expect(
    page.getByRole("heading", { name: "Resumen financiero" }),
  ).toBeVisible({ timeout: 3000 });
  await expect(
    page.getByText("COP 9.007.199.254.740.993,01", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("87,25 %", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Vigencia de las conversiones: desconocida"),
  ).toBeVisible();
  await expect(page.getByText("Internet de Casa")).toBeVisible();
  await expect(page.getByText("Música de Casa")).toBeVisible();
  const unsupported = page.getByRole("button", { name: /Confirmar|Descartar/ });
  await expect(unsupported).toHaveCount(0);
  await page.getByLabel("Espacio activo").selectOption({ label: "Oficina" });
  await page.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(page.getByRole("heading", { name: "Oficina" })).toBeVisible();
  await expect(
    page.getByText("COP 9.007.199.254.740.993,01", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("No hay próximas recurrencias.")).toBeVisible();
  const noSubscriptions = page.getByText("No hay suscripciones detectadas.");
  await expect(noSubscriptions).toBeVisible();
  await page.goto("/overview?from=2026-01-01&from=2026-01-02&to=2026-02-28");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Revisa el período.",
  );
});

test("compares income and expenses and reads category spending for the selected period", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.getByRole("link", { name: "Analítica" }).click();
  await expect(
    page.getByRole("heading", { name: "Analítica", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Desde").fill("2026-01-02");
  await page.getByLabel("Hasta").fill("2026-02-28");
  await page.getByRole("button", { name: "Aplicar período" }).click();
  await expect(page).toHaveURL("/analytics?from=2026-01-02&to=2026-02-28");
  await expect(
    page.getByRole("row", { name: /Alimentación.*COP 123,45/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /2026-01-01.*COP 2.276,55/ }),
  ).toBeVisible();
  await expect(page.getByText("COP 2.400,00", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Vigencia de las conversiones: desconocida"),
  ).toBeVisible();
  await page.goto("/analytics?from=2026-01-01&to=2026-02-30");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Revisa el período.",
  );
});

test("shows the backend balance projection without labeling it as observed", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/analytics?from=2026-01-02&to=2026-02-28");
  const projection = page.getByRole("region", { name: "Proyección de saldo" });
  await expect(
    projection.getByText("Estimación, no saldo observado."),
  ).toBeVisible();
  await expect(
    projection.getByRole("row", { name: /2026-01-01.*−COP 99,01/ }),
  ).toBeVisible();
});

test("creates a hypothetical expense and compares a server-run scenario", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/analytics/scenarios");
  await expect(
    page.getByRole("heading", { name: "Escenarios", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Nombre del escenario").fill("Más gastos");
  await page.getByLabel("Cambio de gasto mensual (COP)").fill("123,45");
  await page.getByRole("button", { name: "Crear escenario" }).click();
  await page.getByRole("button", { name: "Simular Más gastos" }).click();
  await expect(
    page.getByRole("row", {
      name: /Gastos mensuales.*COP 1\.000,00.*COP 1\.123,45.*COP 123,45/,
    }),
  ).toBeVisible();
  await page.goto("/overview");
  await page.getByLabel("Espacio activo").selectOption({ label: "Oficina" });
  await page.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(page.getByRole("heading", { name: "Oficina" })).toBeVisible();
  await page.goto("/analytics/scenarios");
  await expect(page.getByText("Oficina", { exact: true })).toBeVisible();
  await expect(page.getByText("No hay escenarios guardados.")).toBeVisible();
  const saved = page.getByRole("button", { name: "Simular Más gastos" });
  await expect(saved).toHaveCount(0);
});
