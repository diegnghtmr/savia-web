// Reviewer e2e regression for W4 (verify mwr38e1a). Copy to e2e/.
import { expect, type Page } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test, waitForDraftForm } from "./fixtures/browser";

async function fillDraft(page: Page, description: string) {
  await page.goto("/transactions/new", { waitUntil: "domcontentloaded" });
  await waitForDraftForm(page, "Crear transacción");
  await page.getByLabel("Tipo").selectOption("expense");
  await page
    .getByLabel("Cuenta", { exact: true })
    .selectOption({ label: "Caja (COP)" });
  await page.getByLabel("Importe").fill("32,10");
  await page.getByLabel("Fecha (UTC)").fill("2026-01-12");
  await page.getByLabel("Descripción").fill(description);
}

async function selectWorkspace(page: Page, name: string) {
  await page.goto("/overview");
  await page.getByLabel("Espacio activo").selectOption({ label: name });
  await page.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("blocks create, edit and void forms rendered before a workspace switch", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/transactions");
  const item = page.getByRole("link", { name: "Mercado sin confirmar" });
  const detail = (await item.getAttribute("href"))!;
  const editor = await context.newPage();
  const annul = await context.newPage();
  const switcher = await context.newPage();

  await editor.goto(`${detail}?edit=1`, { waitUntil: "domcontentloaded" });
  await waitForDraftForm(editor, "Guardar cambios");
  await annul.goto(detail, { waitUntil: "domcontentloaded" });
  await waitForDraftForm(annul, "Anular transacción");
  await fillDraft(page, "No crear tras cambiar de espacio");
  await editor
    .getByLabel("Descripción")
    .fill("No editar tras cambiar de espacio");
  await annul.getByLabel("Motivo de anulación").fill("Registro duplicado");
  await annul.getByLabel("Confirmo la anulación").check();

  await selectWorkspace(switcher, "Oficina");
  for (const [tab, action] of [
    [page, "Crear transacción"],
    [editor, "Guardar cambios"],
    [annul, "Anular transacción"],
  ] as const) {
    await tab.getByRole("button", { name: action }).click();
    await expect(
      tab.getByRole("form", { name: action }).getByRole("alert"),
    ).toHaveText("El espacio activo cambió. Vuelve a Transacciones.");
  }

  await switcher.goto("/transactions");
  await expect(
    switcher.getByText("No hay transacciones en esta página."),
  ).toBeVisible();
  await selectWorkspace(switcher, "Casa");
  await switcher.goto(detail);
  await expect(
    switcher.getByRole("heading", { name: "Mercado sin confirmar" }),
  ).toBeVisible();
  await expect(switcher.getByText(/Gasto · Pendiente/)).toBeVisible();
  await switcher.goto("/transactions?query=No+crear+tras+cambiar+de+espacio");
  await expect(
    switcher.getByText("No hay transacciones en esta página."),
  ).toBeVisible();
});

test("a create retried after a lost response and reload is recorded only once", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  const description = "Compra con respuesta perdida";
  await fillDraft(page, description);

  const actionUrl = "**/transactions/new";
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  await page.route(actionUrl, async (route) => {
    if (
      route.request().method() !== "POST" ||
      !route.request().postData()?.includes("draftPrepared")
    )
      return route.continue();
    try {
      const committed = await route.fetch({ maxRedirects: 0 });
      const redirect = committed.headers()["x-action-redirect"];
      expect(redirect).toMatch(/^\/transactions\/[a-f0-9-]+;/);
      await route.abort();
      resolve(redirect.split(";")[0]);
    } catch (error) {
      reject(error);
    }
  });
  await page.getByRole("button", { name: "Crear transacción" }).click();
  const firstPath = await promise;
  await page.unroute(actionUrl);

  const list = `/transactions?${new URLSearchParams({ query: description })}`;
  await page.goto(list);
  await expect(page.getByRole("link", { name: description })).toHaveAttribute(
    "href",
    firstPath,
  );
  await expect(page.getByRole("link", { name: "Siguiente" })).toHaveCount(0);

  await fillDraft(page, description);
  await page.getByRole("button", { name: "Crear transacción" }).click();
  await expect(page.getByRole("heading", { name: description })).toBeVisible();
  await page.goto(list);
  await expect(page.getByRole("link", { name: "Siguiente" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: description })).toHaveAttribute(
    "href",
    firstPath,
  );
});
