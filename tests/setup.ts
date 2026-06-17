import "@testing-library/jest-dom/vitest";

/** Minimal JSBigInt for config helpers in unit tests (see lib/config/config.ts). */
class TestJSBigInt implements JSBigIntInstance {
  static readonly ZERO = new TestJSBigInt(0);

  static parse(value: string, radix = 10): JSBigIntInstance {
    return new TestJSBigInt(Number.parseInt(value, radix));
  }

  private readonly n: number;

  constructor(value: string | number) {
    this.n = Number(value);
  }

  valueOf(): number {
    return this.n;
  }

  toString(): string {
    return String(this.n);
  }

  compare(): number {
    return 0;
  }

  add(): JSBigIntInstance {
    return this;
  }

  subtract(): JSBigIntInstance {
    return this;
  }

  divide(): JSBigIntInstance {
    return this;
  }

  pow(): JSBigIntInstance {
    return this;
  }
}

(globalThis as typeof globalThis & { JSBigInt: typeof JSBigInt }).JSBigInt =
  TestJSBigInt as unknown as typeof JSBigInt;

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
