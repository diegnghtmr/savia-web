import { expect, type Page } from "@playwright/test";

export interface TouchTargetViolation {
  selector: string;
  width: number;
  height: number;
  expectedMin: number;
}

/**
 * Sweeps every visible interactive element on an already-loaded page and asserts
 * that its live bounding client rect meets the 44x44 CSS px touch target minimum.
 *
 * Performs no navigation or authentication.
 */
export async function sweepTouchTargets(
  page: Page,
  minSize = 44,
): Promise<void> {
  const violations = await page.evaluate((min) => {
    const selector =
      'button, a, input:not([type="hidden"]), select, [role="button"], [tabindex]';
    const elements = Array.from(document.querySelectorAll(selector));

    const isVisible = (el: Element): boolean => {
      if (typeof el.checkVisibility === "function") {
        if (
          !el.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          })
        ) {
          return false;
        }
      }
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        return false;
      }
      return true;
    };

    const getSelector = (el: Element): string => {
      const parts: string[] = [];
      let curr: Element | null = el;
      while (
        curr &&
        curr !== document.body &&
        curr !== document.documentElement
      ) {
        let part = curr.tagName.toLowerCase();
        if (curr.id) {
          part += `#${curr.id}`;
          parts.unshift(part);
          break;
        }
        const classList = Array.from(curr.classList).filter(Boolean);
        if (classList.length > 0) {
          part += `.${classList.join(".")}`;
        }
        if (curr.getAttribute("type")) {
          part += `[type="${curr.getAttribute("type")}"]`;
        }
        if (curr.getAttribute("name")) {
          part += `[name="${curr.getAttribute("name")}"]`;
        }
        parts.unshift(part);
        curr = curr.parentElement;
      }
      const text = (el.textContent || "").trim().slice(0, 30);
      const textSuffix = text ? ` ("${text}")` : "";
      return (parts.join(" > ") || el.tagName.toLowerCase()) + textSuffix;
    };

    const results: Array<{
      selector: string;
      width: number;
      height: number;
      expectedMin: number;
    }> = [];

    for (const el of elements) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < min || rect.height < min) {
        results.push({
          selector: getSelector(el),
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
          expectedMin: min,
        });
      }
    }

    return results;
  }, minSize);

  if (violations.length > 0) {
    const details = violations
      .map(
        (v) =>
          `  - ${v.selector}: ${v.width}x${v.height}px (minimum ${v.expectedMin}x${v.expectedMin}px)`,
      )
      .join("\n");
    expect(
      violations,
      `Found ${violations.length} interactive element(s) failing touch-target minimum of ${minSize}x${minSize}px:\n${details}`,
    ).toEqual([]);
  }
}

export const assertTouchTargets = sweepTouchTargets;
