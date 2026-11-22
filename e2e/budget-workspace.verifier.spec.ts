// Reviewer e2e regression (verify mwr7bvwf). Copy to e2e/.
import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("budget cursor, details and already rendered write forms cannot cross workspaces", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/budgets?from=2026-01-01&to=2026-02-28&limit=1");
  const next = (await page
    .getByRole("link", { name: "Siguiente" })
    .getAttribute("href"))!;
  const detail = (await page
    .getByRole("link", { name: "Enero" })
    .getAttribute("href"))!;
  await page.goto(next);
  await expect(page.getByRole("link", { name: "Febrero" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enero" })).toHaveCount(0);
  await page.goto(detail);
  await page.getByRole("link", { name: "Editar presupuesto" }).click();
  await expect(
    page.getByRole("button", { name: "Guardar presupuesto" }),
  ).toBeEnabled();
  await page.getByLabel("Nombre").fill("No se debe guardar");
  const tabs = await context.newPage();
  await tabs.goto("/overview");
  await tabs.getByLabel("Espacio activo").selectOption({ label: "Oficina" });
  await tabs.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(tabs.getByRole("heading", { name: "Oficina" })).toBeVisible();
  const cookies = JSON.stringify(
    (await context.cookies()).filter(({ name }) =>
      name.startsWith("savia-draft-"),
    ),
  );
  for (const name of ["Guardar presupuesto", "Guardar asignaciones"]) {
    await page.getByRole("button", { name }).click();
    await expect(
      page.getByRole("form", { name }).getByRole("alert"),
    ).toHaveText("El espacio activo cambió. Vuelve a Presupuestos.");
    expect(
      JSON.stringify(
        (await context.cookies()).filter(({ name }) =>
          name.startsWith("savia-draft-"),
        ),
      ),
    ).toBe(cookies);
  }
  await tabs.goto(next);
  await expect(tabs.locator("main").getByRole("alert")).toHaveText(
    "Revisa los filtros. Limpiar filtros",
  );
  expect((await tabs.goto(detail))?.status()).toBe(404);
  await tabs.goto("/budgets");
  await expect(
    tabs.getByText("No hay presupuestos en esta página."),
  ).toBeVisible();
  await tabs.goto("/overview");
  await tabs.getByLabel("Espacio activo").selectOption({ label: "Casa" });
  await tabs.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(tabs.getByRole("heading", { name: "Casa" })).toBeVisible();
  await tabs.goto(detail);
  await expect(tabs.getByRole("heading", { name: "Enero" })).toBeVisible();
  await expect(
    tabs.getByRole("link", { name: "Editar presupuesto" }),
  ).toHaveAttribute("href", /\/edit\/1$/);
});
