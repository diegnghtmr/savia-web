import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import Page from "../src/app/page";

describe("the static home page", () => {
  it("presents the bounded Spanish task shell", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Organiza lo que sigue",
    );
    expect(
      screen.getByRole("link", { name: "Saltar al contenido" }),
    ).toHaveAttribute("href", "#contenido-principal");
    expect(
      screen.getByRole("navigation", { name: "Navegación principal" }),
    ).toHaveTextContent("Inicio");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
  });

  it("keeps the visual shell static and free of client directives", async () => {
    const source = await readFile(
      resolve(import.meta.dirname, "../src/app/page.tsx"),
      "utf8",
    );

    expect(source).not.toContain("use client");
    expect(source).toContain('className="task-shell"');
  });
});
