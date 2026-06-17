# Portuguese mnemonic interop — verification notes

Backlog item: "confirm decode against a known Conceal Portuguese seed→address." No external published seed→address vector exists, so interop was established by anchoring directly on the canonical upstream implementation, read via `opensrc` (`ConcealNetwork/conceal-web-wallet@development`).

## What was verified

1. **Wordlist parity (authoritative).** Our Portuguese wordlist (`lib/wallet-core/MnemonicLang.ts`) is byte-identical to canonical `conceal-web-wallet` `src/model/MnemonicLang.ts` — 1626 words, same order, `sha256(words.join("\n")) = c76d03f2…de3c`. A new test pins this hash, so any future reorder/edit fails CI.

2. **Encode parity (authoritative).** Our `Mnemonic.mn_encode` is the same algorithm as upstream (identical apart from `let`→`const`). Same wordlist + same encode ⇒ a given seed produces the **exact same Portuguese phrase** a canonical Conceal wallet would. That is the seed→mnemonic interop guarantee.

3. **Decode recovers the true seed.** Our `mn_decode` uses full-word matching for the Portuguese set (`fullWordMatch`), so it recovers the precise word index — and thus the original seed — for every canonically-encoded phrase. The existing round-trip test exercises 1000 seeds, asserting it hits prefix-colliding words.

## Notable finding

Canonical `conceal-web-wallet` `mn_decode` matches words by **3-char prefix only** (`trunc_words.indexOf(word.slice(0,3))`) for *all* languages. For the Portuguese set — which has non-unique 3-char prefixes (e.g. `felipe`/`felicidade` → `fel`) — that resolves a colliding word to the **first** index sharing the prefix, i.e. canonical Conceal itself mis-decodes those phrases back to the wrong seed. Our `fullWordMatch` fix is therefore a strict correctness improvement: importing a Portuguese phrase that canonical exported, we recover the true seed (and address) even in the cases canonical's own decoder would get wrong. The prefix-3 **checksum** is unchanged, so valid phrases still validate.

## Scope note

The seed→address step (CryptoNote key derivation via `Cn`) is language-independent and already covered by the English import flow (unit + e2e); the Portuguese-specific risk is entirely in the mnemonic↔seed mapping, which is now verified against canonical. A real third-party seed→address export would be belt-and-suspenders but isn't publicly available, and fabricating one (by running our own code) would be circular — wordlist + encode parity against the canonical source is the stronger guarantee.

## Verification

`npm run types && npm run lint && npm test` (255 unit, incl. 5 Portuguese cases) green.
