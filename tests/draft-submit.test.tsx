import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { DataForm } from "@/app/_components/data-form";
import { FundForm } from "@/app/_components/fund-form";

const { admit, reserve, save } = vi.hoisted(() => ({
  admit: vi.fn(async () => false),
  reserve: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@/app/_actions/draft-receipt", () => ({
  admitDraftForm: admit,
  reserveDraftForm: reserve,
}));
vi.mock("@/app/_actions/funds", () => ({ saveFund: save }));
vi.mock("@/app/_actions/data", () => ({ saveData: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

it("does not offer submission before the client-only action is hydrated", () => {
  const shell = document.createElement("div");
  shell.innerHTML = renderToString(
    <FundForm
      bound={{ workspaceId: "80000000-0000-4000-8000-000000000001" }}
      accounts={[]}
    />,
  );
  const submit = within(shell).getByRole("button", { name: "Crear fondo" });
  expect(submit).toBeDisabled();
});

it("accepts upload selection only when the client handler is available", () => {
  const form = (
    <DataForm
      bound={{
        workspaceId: "80000000-0000-4000-8000-000000000001",
        kind: "import-upload",
      }}
      label="Analizar extracto"
      resultLabel="Ver revisión"
      upload="import-upload"
    >
      <label>
        Archivo
        <input name="file" type="file" />
      </label>
    </DataForm>
  );
  const shell = document.createElement("div");
  shell.innerHTML = renderToString(form);
  expect(within(shell).getByLabelText("Archivo")).toBeDisabled();
  render(form);
  expect(screen.getByLabelText("Archivo")).toBeEnabled();
});

it("waits for the lock only after submission and exposes admission failure without dispatching", async () => {
  const lock = Promise.withResolvers<void>();
  const request = vi.fn(async (_name: string, run: () => unknown) => {
    await lock.promise;
    return run();
  });
  vi.stubGlobal("navigator", { locks: { request } });
  const error = "Recarga la página antes de volver a intentarlo.";
  reserve.mockResolvedValue({ state: { error } });
  render(
    <FundForm
      bound={{ workspaceId: "80000000-0000-4000-8000-000000000001" }}
      accounts={[]}
    />,
  );
  const button = screen.getByRole("button", { name: "Crear fondo" });
  expect(button).toBeEnabled();
  expect(request).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Nombre"), {
    target: { value: "Reserva" },
  });
  fireEvent.change(screen.getByLabelText("Moneda"), {
    target: { value: "COP" },
  });
  fireEvent.change(screen.getByLabelText("Meta"), { target: { value: "100" } });
  fireEvent.click(button);
  expect(request).toHaveBeenCalledOnce();
  expect(reserve).not.toHaveBeenCalled();
  await act(async () => lock.resolve());
  expect(await screen.findByRole("alert")).toHaveTextContent(error);
  expect(button).toBeEnabled();
  expect(reserve).toHaveBeenCalledOnce();
  expect(admit).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
