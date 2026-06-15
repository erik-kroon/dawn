import { afterEach, describe, expect, test } from "vitest";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import Loader from "./loader";

describe("Loader", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  test("renders an accessible progress indicator shell in the DOM", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    document.body.append(container);

    flushSync(() => {
      root.render(<Loader />);
    });

    const wrapper = container.firstElementChild;
    const icon = container.querySelector("svg");

    expect(wrapper?.className).toContain("items-center");
    expect(icon).not.toBeNull();
    expect(icon?.classList.contains("animate-spin")).toBe(true);

    root.unmount();
  });
});
