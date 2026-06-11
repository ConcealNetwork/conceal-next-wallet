/*
 * Copyright (c) 2018 Gnock
 * Copyright (c) 2018-2019 The Masari Project
 * Copyright (c) 2018-2020 The Karbo developers
 * Copyright (c) 2018-2026 Conceal Community, Conceal.Network & Conceal Devs
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

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
