import "@testing-library/jest-dom/vitest";

// The jsdom/Node test env doesn't expose a working localStorage (Node 24's
// global needs --localstorage-file). Provide a minimal in-memory one so code
// that persists prefs/enrollments (ticker, theme, biometric) is unit-testable.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
}
