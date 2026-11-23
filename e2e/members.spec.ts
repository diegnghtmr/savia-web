import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { MEMBERS_USER } from "./fixtures/accounts.mjs";
import { openEnhancedForm, test } from "./fixtures/browser";

test("manages a collaborative roster without removing its last owner", async ({
  page,
}) => {
  await signInAs(page, MEMBERS_USER.email, MEMBERS_USER.password);
  const invite = await openEnhancedForm(page, "/members", "Invitar miembro");
  const email = "invitado@savia.test";
  await invite.getByLabel("Correo de invitación").fill(email);
  await invite.getByRole("button", { name: "Invitar miembro" }).click();
  await page.getByRole("link", { name: "Continuar" }).click();
  await page.getByRole("link", { name: "Ver invitaciones" }).click();
  const invitation = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: email }),
  });
  await expect(invitation).toContainText("Pendiente");
  const cancel = invitation.getByRole("form", { name: "Cancelar invitación" });
  await expect(cancel).toHaveAttribute("data-enhanced", "true");
  await cancel.getByLabel("Confirmo la cancelación").check();
  await cancel.getByRole("button", { name: "Cancelar invitación" }).click();
  const canceled = /\/members\?tab=invitations&guardado=[\da-f-]{36}$/;
  await expect(page).toHaveURL(canceled);
  await expect(invitation).toContainText("Invitación cancelada.");
  await expect(cancel).toHaveCount(0);
  await page.reload();
  await expect(invitation).toContainText("Invitación cancelada.");
  await page.getByRole("link", { name: "Ver miembros" }).click();
  const row = (name: string) => {
    const has = page.getByRole("heading", { name });
    return page.getByRole("listitem").filter({ has });
  };
  const teammate = row("Miembro de prueba");
  const edit = teammate.getByRole("form", { name: "Cambiar rol" });
  await expect(edit).toHaveAttribute("data-enhanced", "true");
  const saved = /\/members\?guardado=[\da-f-]{36}$/;
  await edit.getByLabel("Rol").selectOption("editor");
  await edit.getByRole("button", { name: "Cambiar rol" }).click();
  await expect(page).toHaveURL(saved);
  await expect(teammate.getByText("Editor · active")).toBeVisible();
  const remove = teammate.getByRole("form", { name: "Eliminar miembro" });
  await remove.getByLabel("Confirmo la eliminación").check();
  const editedUrl = page.url();
  await remove.getByRole("button", { name: "Eliminar miembro" }).click();
  await expect(page).not.toHaveURL(editedUrl);
  await expect(page).toHaveURL(saved);
  await expect(teammate).toHaveCount(0);
  await page.reload();
  await expect(teammate).toHaveCount(0);
  const owner = row("Propietaria de Casa").getByRole("form", {
    name: "Eliminar miembro",
  });
  await expect(owner).toHaveAttribute("data-enhanced", "true");
  await owner.getByLabel("Confirmo la eliminación").check();
  await owner.getByRole("button", { name: "Eliminar miembro" }).click();
  await expect(owner.getByRole("alert")).toHaveText(
    "Debe permanecer al menos un propietario activo.",
  );
});
