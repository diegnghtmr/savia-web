import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeControl } from "../src/app/_components/theme-control";

describe("ThemeControl", () => {
  it("uses the system theme until an explicit accessible override is selected", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({ matches: true, addEventListener: () => {} }),
    });
    render(<ThemeControl />);
    expect(screen.getByText("Tema actual: oscuro")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Usar tema claro" });
    expect(button).not.toHaveAttribute("aria-pressed");
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByText("Tema actual: claro")).toBeInTheDocument();
    expect(localStorage.getItem("savia-theme")).toBe("light");
  });
});
