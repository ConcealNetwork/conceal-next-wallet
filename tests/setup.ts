import "@testing-library/jest-dom/vitest"

/** Minimal JSBigInt for config helpers in unit tests (see lib/config/config.ts). */
class TestJSBigInt implements JSBigIntInstance {
  static readonly ZERO = new TestJSBigInt(0)

  static parse(value: string, radix = 10): JSBigIntInstance {
    return new TestJSBigInt(Number.parseInt(value, radix))
  }

  private readonly n: number

  constructor(value: string | number) {
    this.n = Number(value)
  }

  valueOf(): number {
    return this.n
  }

  toString(): string {
    return String(this.n)
  }

  compare(): number {
    return 0
  }

  add(): JSBigIntInstance {
    return this
  }

  subtract(): JSBigIntInstance {
    return this
  }

  divide(): JSBigIntInstance {
    return this
  }

  pow(): JSBigIntInstance {
    return this
  }
}

;(globalThis as typeof globalThis & { JSBigInt: typeof JSBigInt }).JSBigInt =
  TestJSBigInt as unknown as typeof JSBigInt
