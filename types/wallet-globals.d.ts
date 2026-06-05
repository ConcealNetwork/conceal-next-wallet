/** Globals loaded from public/lib scripts (v1 wallet parity). */

declare const JSBigInt: {
  new (value: string | number): JSBigIntInstance;
  ZERO: JSBigIntInstance;
  parse(value: string, radix?: number): JSBigIntInstance;
};

interface JSBigIntInstance {
  toString(radix?: number): string;
  compare(other: JSBigIntInstance | number): number;
  add(other: JSBigIntInstance): JSBigIntInstance;
  subtract(other: JSBigIntInstance): JSBigIntInstance;
  divide(other: JSBigIntInstance): JSBigIntInstance;
  pow(exp: number): JSBigIntInstance;
  valueOf(): number;
}

declare const nacl: {
  ll: {
    ge_scalarmult: (a: Uint8Array, b: Uint8Array) => Uint8Array;
    ge_double_scalarmult_base_vartime: (a: Uint8Array, b: Uint8Array, c: Uint8Array) => Uint8Array;
    ge_double_scalarmult_postcomp_vartime: (
      a: Uint8Array,
      b: Uint8Array,
      c: Uint8Array,
      d: Uint8Array,
    ) => Uint8Array;
    ge_add: (a: Uint8Array, b: Uint8Array) => Uint8Array;
    ge_scalarmult_base: (a: Uint8Array) => Uint8Array;
  };
  secretbox: {
    (msg: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
    open(box: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array | null;
  };
  util: {
    encodeBase64: (value: Uint8Array) => string;
    decodeBase64: (value: string) => Uint8Array;
    encodeUTF8: (value: string) => Uint8Array;
    decodeUTF8: (value: string) => Uint8Array;
  };
  randomBytes: (bits: number) => Uint8Array;
};

declare const concealjs: any;

/** Set by applyWalletNetworkConfig() after legacy scripts load (v1 global). */
declare const config: import("@/lib/config/config").WalletNetworkConfig;

declare const kjua: (options: Record<string, unknown>) => HTMLCanvasElement | HTMLImageElement | string;

declare const jsPDF: new (
  orientation?: "portrait" | "landscape" | "p" | "l" | Record<string, unknown>,
  unit?: string,
  format?: string | number[],
) => {
  internal: {
    pageSize: {
      width: number;
      height: number;
      getWidth?: () => number;
      getHeight?: () => number;
    };
  };
  setFillColor: (r: number, g: number, b: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  setLineWidth: (width: number) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  setFont: (face: string, style?: string) => void;
  setFontSize: (size: number) => void;
  text: (text: string | string[], x: number, y: number) => void;
  splitTextToSize: (text: string, maxWidth: number) => string | string[];
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  addImage: (
    imageData: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => void;
  save: (filename: string) => void;
};

declare function saveAs(data: Blob, filename: string): void;

interface Window {
  config: import("@/lib/config/config").WalletNetworkConfig;
  logDebugMsg?: (...args: unknown[]) => void;
}
