# SDK Engine Migration (#91) — Phased Plan

Replace the legacy in-app `lib/wallet-core` engine with the external
`conceal-wallet-sdk` package, behind the existing typed service-layer seam,
**phased and non-breaking**. Mock mode and the current wallet-core real mode
keep working throughout; the SDK engine is introduced in parallel and selected
by a flag until it reaches parity.

## Architecture seam

All UI talks to `services` (`lib/services/index.ts` → `WalletServices`, 8
services). Real services call a facade (`lib/wallet-core/*-operations.ts`) over
a stateful `Wallet` + `WalletWatchdog` + workers + encrypted IndexedDB. The
migration introduces an **SDK-backed real engine** selected by
`NEXT_PUBLIC_WALLET_ENGINE` (`wallet-core` default | `sdk`), implementing the
same service interfaces via the SDK. The 8 interfaces and the mock impls are
untouched — spine rule preserved.

## Phase 0 — Foundation (DONE, this branch)

- [x] SDK consumable by the Next app (dep added; currently `file:../conceal-wallet-sdk`).
- [x] **lib-js WASM bundles in the static-export build** with no webpack config —
  verified `crypto_bg.wasm` + `cypher_bg.wasm` ship to `out/_next/static/media/`.
- [x] SDK daemon client accepts **http** for local/private nodes + `allowInsecure`
  for public `:16000` nodes (was https-only; blocked real nodes). Shipped in SDK.
- [ ] Before merge: switch the dep from `file:` to a pinned SDK **release tarball
  URL** (like `conceal-lib-js`) so the branch builds in CI / for others.

## Phase 1 — Broadcast validation gate (IN PROGRESS, user-run)

The SDK spend path (build → sign → serialize) is byte-exact vs the legacy/lib-js
serializer offline, and sync/scan/decoys are validated read-only against real
mainnet. The **one unproven step** is live daemon acceptance of an SDK-built
spend. Until a self-send is broadcast-ACCEPTED (`validate/mainnet-selfsend.mjs`,
run by the wallet owner), **no write-path migration ships**.

## Phase 2 — 🟢 Read / crypto services (non-breaking, flag-gated)

Services the SDK already covers cleanly:
- **network** → SDK `DaemonClient` (getHeight, fee address).
- **message** crypto (encrypt/decrypt) → SDK `messages.*` (note: smart-message
  TTL encoding is a gap — see Phase 5).
- **address validation/derivation** in forms → SDK `isValidAddress` /
  `decodeAddress` / `encodeAddress`.
- **market** — already wallet-core-free; no change.

## Phase 3 — Wallet lifecycle + sync (read paths)

- create / import / restore / unlock → SDK `account.*` + an **encrypted-storage
  adapter** bridging SDK `WalletState` ↔ the app's v1-compatible encrypted
  IndexedDB envelope (`"wallet"` key). Password verify = decrypt-and-discard.
- sync + balance + tx history → SDK `createWalletSync` + `DaemonClient`, with the
  app supplying a `StorageAdapter`. Decide worker strategy (SDK sync is pure JS;
  the app's `WalletWatchdog` worker pool has no SDK equivalent — perf review on
  mobile, see Phase 5).

## Phase 4 — Write paths (gated on Phase 1)

- **transaction.send** → SDK `buildTransaction` + broadcast. Only after Phase 1
  ACCEPTED on mainnet.

## Phase 5 — Gaps requiring SDK feature work (file as SDK backlog)

The SDK does **not** yet cover these; they stay on wallet-core (or the SDK
engine errors clearly) until built:
- **Deposits / banking** — deposit & withdrawal tx encoding (type-03 target +
  term), interest math.
- **Fusion / optimize** — wallet optimization transactions.
- **Smart-message TTL** — message TTL field + smart-message command encoding in
  tx extra (crypto is covered; the protocol framing is not).
- **Legacy key normalization** — `KeysRepository.normalizeKeys` handles partial
  / v1 key shapes when opening old wallets; SDK assumes well-formed keys.

## Risks / decisions

- **Two lib-js copies**: app build scripts use lib-js (devDep, vendored globals);
  the SDK bundles lib-js as a module. They don't conflict (separate resolution),
  but eventually the vendored-globals path retires as the SDK takes over.
- **Worker sync parity**: SDK `WalletSync` is timer-free/pure; matching the
  legacy worker-pool throughput may need an app-side worker wrapper.
- **Dep portability**: `file:` dep is local-only — must become a release URL
  before this branch can merge / pass CI.
