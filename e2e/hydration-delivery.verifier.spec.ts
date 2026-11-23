// Reviewer regression (verify mwtpt2lz). Add as e2e/hydration-delivery.verifier.spec.ts (unshielded Chromium delivery smoke).
import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { MEMBERS_USER, ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

for (const { path, label, user } of [
  { path: "/members", label: "Invitar miembro", user: MEMBERS_USER },
  { path: "/mcp-grants", label: "Crear permiso MCP", user: ONBOARDED_USER },
]) {
  test(`${path} hydrates using Chromium's normal script requests`, async ({
    page,
  }) => {
    await signInAs(page, user.email, user.password);
    await page.goto(path);
    await expect(page.getByRole("form", { name: label })).toHaveAttribute(
      "data-enhanced",
      "true",
    );
  });
}
