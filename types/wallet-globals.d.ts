/** Globals loaded from public/lib scripts (v1 wallet parity). */

declare const JSBigInt: {
  new (value: string | number): JSBigIntInstance
  ZERO: JSBigIntInstance
  parse(value: string, radix?: number): JSBigIntInstance
}

interface JSBigIntInstance {
  toString(radix?: number): string
  compare(other: JSBigIntInstance | number): number
  add(other: JSBigIntInstance): JSBigIntInstance
  subtract(other: JSBigIntInstance): JSBigIntInstance
  divide(other: JSBigIntInstance): JSBigIntInstance
  pow(exp: number): JSBigIntInstance
  valueOf(): number
}

declare const nacl: {
  ll: {
    ge_scalarmult: (a: Uint8Array, b: Uint8Array) => Uint8Array
    ge_double_scalarmult_base_vartime: (a: Uint8Array, b: Uint8Array, c: Uint8Array) => Uint8Array
    ge_double_scalarmult_postcomp_vartime: (
      a: Uint8Array,
      b: Uint8Array,
      c: Uint8Array,
      d: Uint8Array,
    ) => Uint8Array
    ge_add: (a: Uint8Array, b: Uint8Array) => Uint8Array
    ge_scalarmult_base: (a: Uint8Array) => Uint8Array
  }
  secretbox: {
    (msg: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array
    open(box: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array | null
  }
  util: {
    encodeBase64: (value: Uint8Array) => string
    decodeBase64: (value: string) => Uint8Array
    encodeUTF8: (value: string) => Uint8Array
    decodeUTF8: (value: string) => Uint8Array
  }
  randomBytes: (bits: number) => Uint8Array
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const concealjs: any

/** Set by applyWalletNetworkConfig() after legacy scripts load (v1 global). */
declare const config: import("@/lib/config/config").WalletNetworkConfig

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const kjua: (options: Record<string, unknown>) => string

declare function saveAs(data: Blob, filename: string): void

interface Window {
  config: import("@/lib/config/config").WalletNetworkConfig
  logDebugMsg?: (...args: unknown[]) => void
}
