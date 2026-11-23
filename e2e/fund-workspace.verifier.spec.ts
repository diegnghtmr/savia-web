// Reviewer e2e regression (verify mwr9r0b2). Copy to e2e/.
import { expect, type Page } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

async function switchWorkspace(page: Page, name: string) {
  await page.goto("/overview");
  await page.getByLabel("Espacio activo").selectOption({ label: name });
  await page.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("rejects stale fund forms after switching spaces and exposes no edit or withdrawal", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/funds?limit=1");
  const detail = (await page
    .getByRole("link", { name: "Emergencias" })
    .getAttribute("href"))!;
  const next = (await page
    .getByRole("link", { name: "Siguiente" })
    .getAttribute("href"))!;
  await page.goto(detail);
  // W18 added fund edit and withdrawal; they must be bound to this verified workspace.
  await expect(
    page.getByRole("button", { name: /editar|retirar|retiro/i }),
  ).toHaveCount(2);
  const contribute = (await page
    .getByRole("link", { name: "Registrar aporte" })
    .getAttribute("href"))!;
  await page.goto(contribute);
  await page.getByLabel("Cuenta de origen").selectOption({ label: "Caja" });
  await page.getByLabel("Importe (COP)").fill("0,01");
  await page.getByLabel("Fecha").fill("2026-02-01");
  const create = await context.newPage();
  await create.goto("/funds/new");
  await create.getByLabel("Nombre").fill("No guardar en otro espacio");
  await create.getByLabel("Moneda").fill("COP");
  await create.getByLabel("Meta").fill("100,01");
  await expect(
    create.getByRole("button", { name: "Crear fondo" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Registrar aporte" }),
  ).toBeEnabled();
  const switcher = await context.newPage();
  await switchWorkspace(switcher, "Oficina");
  const draftCookies = async () =>
    JSON.stringify(
      (await context.cookies()).filter(({ name }) =>
        name.startsWith("savia-draft-"),
      ),
    );
  const before = await draftCookies();
  for (const [tab, name] of [
    [page, "Registrar aporte"],
    [create, "Crear fondo"],
  ] as const) {
    await tab.getByRole("button", { name }).click();
    await expect(tab.getByRole("form", { name }).getByRole("alert")).toHaveText(
      "El espacio activo cambió. Vuelve a Fondos.",
    );
    expect(await draftCookies()).toBe(before);
  }
  expect((await switcher.goto(detail))?.status()).toBe(404);
  expect((await switcher.goto(contribute))?.status()).toBe(404);
  await switcher.goto(next);
  await expect(switcher.locator("main").getByRole("alert")).toHaveText(
    "Revisa los filtros. Limpiar filtros",
  );
  await switcher.goto("/funds");
  await expect(
    switcher.getByText("No hay fondos en esta página."),
  ).toBeVisible();
  await switchWorkspace(switcher, "Casa");
  await switcher.goto(detail);
  await expect(switcher.getByText("COP 250,00", { exact: true })).toBeVisible();
  await expect(switcher.getByText("25,00 %", { exact: true })).toBeVisible();
  await switcher.goto("/funds");
  await expect(
    switcher.getByRole("link", { name: "No guardar en otro espacio" }),
  ).toHaveCount(0);
});
