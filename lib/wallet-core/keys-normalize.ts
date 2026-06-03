import type { UserKeys } from "./KeysRepository";

export type KeysNormalizeResult =
  | { kind: "ready"; keys: UserKeys }
  | { kind: "derive_pub"; spend: string; view: string }
  | { kind: "invalid" };

/** Pure shape analysis — no crypto; used by KeysRepository and unit tests. */
export function analyzeKeysShape(keys: unknown): KeysNormalizeResult {
  if (!keys || typeof keys !== "object") {
    return { kind: "invalid" };
  }

  const k = keys as Record<string, unknown>;

  if (k.priv && k.pub) {
    const priv = k.priv as { spend?: string; view?: string };
    const pub = k.pub as { spend?: string; view?: string };
    const spend = priv.spend ?? "";
    const view = priv.view ?? "";

    if (!pub.spend || !pub.view) {
      if (spend !== "") {
        return { kind: "derive_pub", spend, view };
      }
      if (pub.spend && view !== undefined) {
        return {
          kind: "ready",
          keys: {
            priv: { spend, view },
            pub: { spend: pub.spend, view: pub.view ?? "" },
          },
        };
      }
      return { kind: "invalid" };
    }

    return { kind: "ready", keys: k as UserKeys };
  }

  const spend = k.spend as { sec?: string } | undefined;
  const view = k.view as { sec?: string } | undefined;
  if (spend?.sec && view?.sec) {
    return { kind: "derive_pub", spend: spend.sec, view: view.sec };
  }

  return { kind: "invalid" };
}
