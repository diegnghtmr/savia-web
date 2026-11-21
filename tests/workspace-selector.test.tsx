import { fireEvent, render, screen } from "@testing-library/react";
import { WorkspaceSelector } from "@/app/_components/workspace-selector";

it("labels the active workspace and submits a new choice through the action", async () => {
  const action = vi.fn(async (_previous: string | null, form: FormData) => {
    expect(form.get("workspaceId")).toBe("office");
    return "Este espacio ya no está disponible.";
  });
  render(
    <WorkspaceSelector
      items={[
        { id: "home", name: "Casa" },
        { id: "office", name: "Oficina" },
      ]}
      active="home"
      action={action}
    />,
  );

  const selector = screen.getByRole("combobox", { name: "Espacio activo" });
  expect(selector).toHaveValue("home");
  expect(screen.getByRole("option", { name: "Casa" })).toHaveProperty(
    "selected",
    true,
  );
  fireEvent.change(selector, { target: { value: "office" } });
  fireEvent.click(screen.getByRole("button", { name: "Cambiar de espacio" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Este espacio ya no está disponible.",
  );
  expect(action).toHaveBeenCalledOnce();
});
