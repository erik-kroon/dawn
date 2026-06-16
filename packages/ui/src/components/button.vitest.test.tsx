import { afterEach, describe, expect, test } from "vitest";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { Button } from "./button";

describe("Button", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  test("renders button semantics and dispatches click handlers", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let clicks = 0;

    document.body.append(container);

    flushSync(() => {
      root.render(
        <Button aria-label="Save changes" variant="outline" onClick={() => (clicks += 1)}>
          Save
        </Button>,
      );
    });

    const button = container.querySelector("button");

    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Save changes");
    expect(button?.getAttribute("data-slot")).toBe("button");
    expect(button?.className).toContain("border-input");
    expect(button?.textContent).toBe("Save");

    button?.click();

    expect(clicks).toBe(1);

    root.unmount();
  });
});
