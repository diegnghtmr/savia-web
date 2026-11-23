// Reviewer regression (verify mwtuuj0d). Add as tests/bulk-preview.verifier.test.tsx and list it in test:component.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { BulkForm } from "@/app/(workspace)/transactions/bulk-form";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/_actions/capabilities", () => ({ saveCapability: save }));
vi.mock("@/app/_actions/draft-receipt", () => ({ acknowledgeDraft: vi.fn() }));

it("confirms one versioned bulk conversion only after reviewing both selected rows", async () => {
  const first = "80000000-0000-4000-8000-000000000001:7";
  const second = "80000000-0000-4000-8000-000000000002:8";
  const binding = {
    workspaceId: first.slice(0, 36),
    userId: second.slice(0, 36),
  };
  save.mockImplementation(async (_bound, _previous, form: FormData) =>
    form.has("draftPrepared") ? {} : { prepared: "ticket" },
  );
  render(
    <BulkForm
      binding={binding}
      names={
        new Map([
          [first, "Ajuste A"],
          [second, "Ajuste B"],
        ])
      }
      categories={new Map()}
      payees={new Map()}
      tags={new Map()}
    >
      <label>
        <input type="checkbox" name="target" value={first} />
        Ajuste A
      </label>
      <label>
        <input type="checkbox" name="target" value={second} />
        Ajuste B
      </label>
    </BulkForm>,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Ajuste A" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Ajuste B" }));
  fireEvent.change(screen.getByLabelText("Acción en lote"), {
    target: { value: "convertImported" },
  });
  fireEvent.change(screen.getByLabelText("Convertir a"), {
    target: { value: "expense" },
  });
  const previewButton = screen.getByRole("button", {
    name: "Vista previa del lote",
  });
  await act(() => fireEvent.click(previewButton));
  const preview = screen.getByRole("region", { name: "Vista previa del lote" });
  expect(within(preview).getByText("Convertir a: Gasto")).toBeVisible();
  expect(
    within(preview)
      .getAllByRole("listitem")
      .map((row) => row.textContent),
  ).toEqual(["Ajuste A", "Ajuste B"]);
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(within(preview).getByLabelText("Confirmo la acción en lote"));
  expect(save).not.toHaveBeenCalled();
  const applyButton = within(preview).getByRole("button", {
    name: "Aplicar acción en lote",
  });
  await act(() => fireEvent.click(applyButton));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  const [bound, , draft] = save.mock.calls[1];
  expect(bound).toEqual({ ...binding, kind: "bulk-transactions" });
  expect(draft.getAll("target")).toEqual([first, second]);
  expect(draft.get("targetType")).toBe("expense");
  expect(draft.get("confirmed")).toBe("yes");
  expect(draft.get("draftPrepared")).toBe("ticket");
});
