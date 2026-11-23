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
  // W18 added subscription decisions for workspace writers.
  const decisions = page.getByRole("button", { name: /Confirmar|Descartar/ });
  await expect(decisions).toHaveCount(2);
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
  // The L16 GET form serializes the default grouping and blank optional filters.
  await expect(page).toHaveURL(
    "/analytics?from=2026-01-02&to=2026-02-28&granularity=month" +
      "&presentationCurrency=&accountIds=&categoryIds=&tagIds=&payeeIds=&memberIds=&metric=",
  );
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
  await expect(page.locator("main").getByRole("alert")).toHaveText(
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

// Reviewer regression (verify mwrd7bv0). Append to e2e/insights.spec.ts.
test("rejects scenario actions from a tab opened before a workspace switch", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/analytics/scenarios");
  await page.getByLabel("Nombre del escenario").fill("Escenario de Casa");
  await page.getByLabel("Cambio de gasto mensual (COP)").fill("-12,34");
  await page.getByRole("button", { name: "Crear escenario" }).click();
  const simulate = page.getByRole("button", {
    name: "Simular Escenario de Casa",
  });
  await expect(simulate).toBeVisible();

  await page.getByLabel("Nombre del escenario").fill("No guardar");
  await page.getByLabel("Cambio de gasto mensual (COP)").fill("1,01");
  const switcher = await context.newPage();
  await switcher.goto("/overview");
  await switcher
    .getByLabel("Espacio activo")
    .selectOption({ label: "Oficina" });
  await switcher.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(
    switcher.getByRole("heading", { name: "Oficina" }),
  ).toBeVisible();

  const stale = page.getByText(
    "El espacio activo cambió. Vuelve a Escenarios.",
    { exact: true },
  );
  await simulate.click();
  await expect(stale).toHaveCount(1);
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByRole("button", { name: "Crear escenario" }).click();
  await expect(stale).toHaveCount(2);
  await switcher.goto("/analytics/scenarios");
  await expect(
    switcher.getByText("No hay escenarios guardados."),
  ).toBeVisible();
});
