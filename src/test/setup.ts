import { afterEach } from "vitest";

/**
 * Shared test setup. The DOM pieces only run in files that opt in with
 * `// @vitest-environment jsdom`; the existing Node-only tests are unaffected.
 */
if (typeof window !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());

  // jsdom has no matchMedia; the settings panel reads the reduced-motion preference through it.
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
}
