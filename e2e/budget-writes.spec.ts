import { expect, type Page } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

async function loseResponse(page: Page, button: string) {
  const url = page.url();
  const done = Promise.withResolvers<void>();
  await page.route(url, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    try {
      const reply = await route.fetch({ maxRedirects: 0 });
      expect(reply.ok()).toBe(true);
      await route.abort();
      done.resolve();
    } catch (error) {
      done.reject(error);
    }
  });
  await page.getByRole("button", { name: button }).click();
  await done.promise;
  await page.unroute(url);
}

test("replays a lost budget create and edit after reopening, then saves category allocations", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/budgets");
  await page.getByRole("link", { name: "Nuevo presupuesto" }).click();
  const create = async () => {
    await page.getByLabel("Nombre").fill("Marzo en casa");
    await page.getByLabel("Inicio del periodo").fill("2026-03-01");
    await page.getByLabel("Fin del periodo").fill("2026-03-31");
  };
  await create();
  await loseResponse(page, "Crear presupuesto");
  await page.reload();
  await create();
  await page.getByRole("button", { name: "Crear presupuesto" }).click();
  await page.getByRole("link", { name: "Ver presupuesto" }).click();
  await page.getByRole("link", { name: "Editar presupuesto" }).click();
  await expect(page).toHaveURL(/\/edit\/1$/);
  const editUrl = page.url();
  await page.getByLabel("Nombre").fill("Marzo familiar");
  await loseResponse(page, "Guardar presupuesto");
  await page.reload();
  await expect(page.getByLabel("Nombre")).toHaveValue("Marzo familiar");
  await page.getByRole("button", { name: "Guardar presupuesto" }).click();
  await page.getByRole("link", { name: "Ver presupuesto" }).click();
  await expect(
    page.getByRole("heading", { name: "Marzo familiar" }),
  ).toBeVisible();
  const link = page.getByRole("link", { name: "Editar presupuesto" });
  await expect(link).toHaveAttribute("href", /\/edit\/2$/);
  await link.click();
  await page.getByRole("button", { name: "Añadir categoría" }).click();
  await page
    .getByRole("combobox", { name: "Categoría", exact: true })
    .selectOption({ label: "Alimentación" });
  await page.getByLabel("Importe planeado (COP)").fill("1234,56");
  await loseResponse(page, "Guardar asignaciones");
  await page.reload();
  await expect(page.getByLabel("Importe planeado (COP)")).toHaveValue(
    "1234.56",
  );
  await page.getByRole("button", { name: "Guardar asignaciones" }).click();
  await page.getByRole("link", { name: "Ver presupuesto" }).click();
  await expect(page.getByText(/1\.234,56/)).toHaveCount(2);
  await expect(page.getByText("0,00 %")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Editar presupuesto" }),
  ).toHaveAttribute("href", /\/edit\/3$/);
  await page
    .getByRole("link", { name: "Copiar a un nuevo presupuesto" })
    .click();
  await expect(
    page.getByText("Copiar asignaciones de: Marzo familiar"),
  ).toBeVisible();
  await page.getByLabel("Nombre").fill("Abril familiar");
  await page.getByLabel("Inicio del periodo").fill("2026-04-01");
  await page.getByLabel("Fin del periodo").fill("2026-04-30");
  await page.getByRole("button", { name: "Crear presupuesto" }).click();
  await page.getByRole("link", { name: "Ver presupuesto" }).click();
  await expect(
    page.getByRole("heading", { name: "Abril familiar" }),
  ).toBeVisible();
  await expect(page.getByText(/1\.234,56/)).toHaveCount(2);
  await page.goto(editUrl);
  await page.getByLabel("Nombre").fill("Edición obsoleta");
  await page.getByRole("button", { name: "Guardar presupuesto" }).click();
  await expect(
    page.getByRole("form", { name: "Guardar presupuesto" }).getByRole("alert"),
  ).toHaveText("El presupuesto cambió. Vuelve al detalle antes de editarlo.");
  await page.goto("/budgets");
  await expect(page.getByRole("link", { name: "Marzo familiar" })).toHaveCount(
    1,
  );
  await expect(page.getByRole("link", { name: "Marzo en casa" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Edición obsoleta" }),
  ).toHaveCount(0);
});
