# SDK Port Spec — Wallet Fusion / Optimization

Status: SDK backlog (Phase 5 of `../PLAN.md`). Read-only analysis; no source
modified. All `file:line` refs are to this repo unless prefixed `sdk:`, which
means `/Users/travis/Projects/conceal-wallet-sdk/`.

This spec defines the SDK feature work required to move the **wallet
optimization / fusion** path off `lib/wallet-core` and onto
`conceal-wallet-sdk`. The current SDK builder (`sdk:src/transactions.ts`) builds
a normal spend (`buildTransaction`) but has **no concept of fusion**: no
denomination bucketing, no min-input-count gate, no zero-recipient self-send,
and no "is optimization needed" computation.

---

## 1. What a fusion (optimization) transaction IS for Conceal

A fusion transaction is a **self-send that consolidates many small, same-power-of-ten
outputs into a few larger outputs**, shrinking the wallet's UTXO count so future
spends need fewer inputs (smaller, cheaper, faster txs). It is the CryptoNote
"sweep dust / optimize" primitive.

Defining properties (from `lib/wallet-core/Wallet.ts:1184` `createFusionTransaction`
and `lib/wallet-core/Currency.ts:39-43`):

- **Self-send, single recipient = the wallet's own address.** The one destination
  is `this.getPublicAddress()` for `inputsAmount - fee` atomic
  (`Wallet.ts:1234-1241`). After power-of-ten decomposition this yields a small
  number of larger outputs.
- **Inputs are restricted to one denomination bucket.** Only "pretty" (exact
  power-of-ten) amounts below `threshold` qualify, and a single fusion draws all
  its inputs from **one** power-of-ten bucket (`Wallet.ts:1067` `pickRandomFusionInputs`).
- **Low / fixed fee.** The fee is `config.minimumFee_V2` =
  `minimumFeeV2Atomic = 1000` atomic (`config.ts:103`,
  `wallet-network-scalars.mjs:5`) — the cheapest valid fee, NOT a percentage. (It
  is not literally zero on Conceal, but it is the network minimum and constant.)
- **Mixin = the wallet default (`config.defaultMixin = 5`).** Conceal fusion is
  NOT mixin-0 (unlike Monero's optional mixin-0 fusion). The decoy ring is built
  exactly like a normal spend (`Wallet.ts:1230-1232` requests
  `defaultMixin + 1 = 6` outs per amount). Note: the separate "unspendable dust"
  path mentioned at `Wallet.ts:846` is a *future* mixin=0 idea and is NOT what
  `createFusionTransaction` does today.
- **Size-bounded.** The serialized tx must fit `Currency.fusionTxMaxSize`
  = `CRYPTONOTE_BLOCK_GRANTED_FULL_REWARD_ZONE * 30 / 100 = 100000 * 0.30 = 30000`
  bytes (`Currency.ts:30,40`). Inputs are popped until it fits
  (`Wallet.ts:1222-1270`).
- **On-chain it is recognizable** (so the UI can label it "Optimization"):
  `TransactionsExplorer.ts:745-752` flags `tx.fusion = true` when
  `vin.length > fusionTxMinInputCount (12)` AND `vout.length <= maxFusionOutputs (8)`
  AND `vin.length / vout.length > fusionTxMinInOutCountRatio (4)` AND inputs/outputs
  aren't type-`03` (deposits) AND `fee === 0 || fee === minimumFee_V2`.

---

## 2. The exact selection algorithm

Three cooperating pieces in `lib/wallet-core`. The SDK must reproduce all three
as **pure functions** (no `Wallet` instance, no network).

### 2a. Output eligibility — `isAmountApplicableInFusionTransactionInput`
`Currency.ts:52-75`. An unspent output `amount` qualifies for a fusion at
`threshold` and chain `height` iff ALL hold:

1. `amount < threshold` (strictly below the threshold). `Currency.ts:57`.
2. If `height < config.UPGRADE_HEIGHT_V4 (45000)`: `amount >= config.dustThreshold`
   (`defaultDustThresholdAtomic = 10`). Above V4 this lower bound is dropped.
   `Currency.ts:61`.
3. **`amount` must be an exact "pretty" amount** — present in `config.PRETTY_AMOUNTS`
   (the `{1,2,…,9}×10^k` ladder, `config.ts:147-172`). The check is
   `idx = PRETTY_AMOUNTS.findIndex(a => a >= amount); PRETTY_AMOUNTS[idx] === amount`.
   Non-pretty amounts (e.g. change like 12345) are rejected. `Currency.ts:65-70`.
4. Bucket = **power-of-ten group**: `amountPowerOfTen = Math.floor(idx / 9)`
   (the ladder has 9 entries per decade: 1–9, 10–90, 100–900, …). `Currency.ts:72`.

### 2b. Bucket selection + input draw — `pickRandomFusionInputs`
`Wallet.ts:1067-1146`. Inputs:
`(threshold, blockchainHeight, minInputCount = fusionTxMinInputCount (12), maxInputCount)`.

1. `NUM_BUCKETS = 20` (a u64 has up to 19–20 decimal digits). `Wallet.ts:1073`.
2. From the wallet's **unspent** outputs only
   (`TransactionsExplorer.formatWalletOutsForTx(this, blockchainHeight)`,
   `Wallet.ts:1077`), keep those passing 2a; tally per-bucket counts
   (`bucketSizes[powerOfTen]++`). `Wallet.ts:1084-1097`.
3. Shuffle the 20 bucket indices (`ShuffleGenerator`) and pick the **first**
   bucket whose `bucketSizes[bucket] >= minInputCount (12)`; if none, return `[]`.
   `Wallet.ts:1099-1113`.
4. Compute that bucket's `[lowerBound, upperBound)` = `[10^bucket, 10^(bucket+1))`
   (top bucket upper = `Number.MAX_SAFE_INTEGER`). `Wallet.ts:1116-1121`.
5. Select all eligible outs with `lowerBound <= amount < upperBound`; if fewer
   than `minInputCount`, return `[]`; else sort ascending by amount.
   `Wallet.ts:1124-1132`.
6. If more than `maxInputCount`, **randomly** down-sample to `maxInputCount`
   (shuffle-pick), then re-sort ascending. `Wallet.ts:1134-1145`.

### 2c. Size-fit loop — `createFusionTransaction`
`Wallet.ts:1184-1290`. Count limits and the build:

1. `MAX_FUSION_OUTPUTS = config.maxFusionOutputs (8)`; `fusionThreshold =
   config.dustThreshold`; `neededFee = config.minimumFee_V2`. Throw "Threshold is
   too low" if `threshold <= fusionThreshold`. `Wallet.ts:1190-1195`.
2. **Max inputs that physically fit**:
   `estimateFusionInputsCount =
   Currency.getApproximateMaximumInputCount(fusionTxMaxSize (30000),
   MAX_FUSION_OUTPUTS (8), defaultMixin (5))` (`Currency.ts:84-104`, byte-size
   model). If `< fusionTxMinInputCount (12)` → throw "Mixin count is too big".
   `Wallet.ts:1200-1207`.
3. `fusionInputs = pickRandomFusionInputs(threshold, height, 12, estimateFusionInputsCount)`.
   If `< 12` → throw "Nothing to optimize". `Wallet.ts:1208-1216`.
4. **Shrink-to-fit loop**: build a raw tx (one self-destination =
   `Σinputs − fee`); compute `getApproximateTransactionSize(vin, vout, mixin)`
   (`Currency.ts:106-126`); if `size > fusionTxMaxSize` and still `>= 12` inputs,
   `pop()` one input and rebuild. `Wallet.ts:1222-1270`.
5. Post-conditions before broadcast: `fusionInputs.length >= 12`
   (`Wallet.ts:1272`), tx has `>0` outputs (`:1275`), and
   `vout.length <= MAX_FUSION_OUTPUTS (8)` (`:1278`).

> Conceal max fusion inputs is **bounded by tx size + ratio**, not a flat cap.
> `Currency.fusionTxMaxInputCount = 100` (`Currency.ts:42`) is the C++ default but
> is **not referenced** by this JS path (the size estimate is the effective cap).
> Document it as a constant but gate on `estimateFusionInputsCount`.

---

## 3. Optimization-status computation ("is optimization needed?")

`Wallet.ts:1148-1182` `optimizationNeeded(blockchainHeight, threshold)` →
`{ numOutputs, isNeeded }`; surfaced via
`settings-operations.ts:199-213` `getOptimizationStatusOperation` (called with
`threshold = config.optimizeThreshold = 900000000`, `config.ts:109`) and mapped to
the `OptimizationStatus` service type `{ isNeeded, unspentOutputs }`
(`lib/types/index.ts:186-189`; service `lib/services/settings.service.ts:6`,
real `lib/services/real/settings.service.ts:19-21`, mock
`lib/services/mock/settings.service.ts:46-49`).

Algorithm:
1. `unspentOutsCount = formatWalletOutsForTx(...).length`. `Wallet.ts:1149-1153`.
2. If `unspentOutsCount < config.optimizeOutputs (100)` → `isNeeded = false`
   (return early; `numOutputs = unspentOutsCount`). `Wallet.ts:1155-1160`.
   **This is the primary gate: optimization is only ever "needed" once the wallet
   holds ≥ 100 unspent outputs.**
3. `balance = availableAmount(height)`. Loop `threshold` upward (×10 each pass,
   `Wallet.ts:1170`) while `threshold <= balance`:
   - `estimation = estimateFusionReadyness(threshold, height)` (`Wallet.ts:1026-1065`):
     buckets eligible outs (2a), and `fusionReadyCount += bucketSize` for every
     bucket whose `bucketSize >= config.optimizeOutputs (100)`.
   - If `fusionReadyCount > config.optimizeOutputs / 2 (50)` → `fusionReady =
     true`, break. `Wallet.ts:1164-1172`.
4. `isNeeded = fusionReady`. Return `{ numOutputs: unspentOutsCount, isNeeded }`.
   `Wallet.ts:1173-1181`.

> Note the asymmetry between *needed* and *buildable*: `estimateFusionReadyness`
> only counts buckets with **≥100** outs (`Wallet.ts:1056`), but
> `pickRandomFusionInputs` builds from any bucket with **≥12** (`Wallet.ts:1109`).
> So "needed" is the strong signal; a single `optimize` call clears one bucket and
> the user may need several. The SDK must preserve both thresholds verbatim.

`optimizeWalletOperation` (`settings-operations.ts:215-239`) calls
`optimizationNeeded` first and returns `{ ok: true, optimized: false }` when not
needed; otherwise it runs `createFusionTransaction` and `checkMempool()`. The SDK
API must mirror this "check, then build-and-broadcast one round" contract.

---

## 4. Concrete SDK API to add

Add to `sdk:src/transactions.ts` (or a sibling `sdk:src/fusion.ts` re-exported
from `sdk:src/index.ts:50`). Keep the **pure-function, daemon-values-supplied**
style of the existing builder (`buildTransaction` takes `decoys`/`fee`/`mixin` as
inputs, never fetches — `sdk:src/transactions.ts:265-283`). The app/service layer
fetches height + decoys (via `daemon.getRandomOuts`,
`sdk:src/daemon.ts:78,255`) and broadcasts.

### 4a. `isOptimizationNeeded` (status, pure)
```ts
export interface FusionStatusInput {
  unspentOutputs: SpendableOutput[];   // wallet's current spendable set
  balance: number;                     // availableAmount(height), atomic
  blockchainHeight: number;
  threshold?: number;                  // default OPTIMIZE_THRESHOLD (900000000)
}
export interface FusionStatus { isNeeded: boolean; unspentOutputs: number; }
export function isOptimizationNeeded(input: FusionStatusInput): FusionStatus;
```
Ports §3 exactly (the `<100` early return, the ×10 threshold climb, the
`fusionReadyCount > 50` test, buckets counted only at `≥100`). Return shape
matches the existing `OptimizationStatus` service type so the real
settings.service maps it 1:1.

### 4b. `selectFusionInputs` (selection, pure)
```ts
export interface FusionInputSelection {
  selected: SpendableOutput[];   // one bucket, ascending by amount, ≥12, ≤maxInputs
  bucketPowerOfTen: number;
}
export function selectFusionInputs(
  unspentOutputs: SpendableOutput[],
  threshold: number,
  blockchainHeight: number,
  minInputCount?: number,        // default FUSION_MIN_INPUT_COUNT (12)
  maxInputCount?: number,        // default = computed max (see 4d)
  shuffle?: (n: number) => number,   // injectable for determinism in tests
): FusionInputSelection | null;  // null when no bucket qualifies (= "nothing to optimize")
```
Ports §2a + §2b. The `shuffle` seam mirrors `selectInputs`'s injectable `order`
(`sdk:src/transactions.ts:399-404`) so tests are reproducible while the live
wallet shuffles. The pretty-amount membership test must reuse the same
`PRETTY_AMOUNTS` ladder (port the constant; see §5).

### 4c. `buildFusionTransaction` (build, pure — REUSES `buildTransaction`)
```ts
export interface BuildFusionTransactionInput {
  keys: WalletKeys;
  selfKeys: { spendPublicKey: Hex; viewPublicKey: Hex };  // decoded own address
  fusionInputs: SpendableOutput[];     // from selectFusionInputs
  decoys: DecoySet[];                  // getRandomOuts(inputAmounts, mixin+1)
  fee?: number;                        // default MINIMUM_FEE_V2 (1000)
  mixin?: number;                      // default DEFAULT_MIXIN (5)
  maxOutputs?: number;                 // default MAX_FUSION_OUTPUTS (8)
  maxTxSize?: number;                  // default FUSION_TX_MAX_SIZE (30000)
}
export function buildFusionTransaction(
  input: BuildFusionTransactionInput,
): BuiltTransaction;   // same return type as buildTransaction
```
Implementation = a thin wrapper that **reuses `buildTransaction`**:
- Single destination back to self: `{ ...selfKeys, amount: ΣfusionInputs − fee }`
  (`Wallet.ts:1234-1241`). No separate change output and no remote-node fee
  output (fusion is a pure self-consolidation).
- Pass `fusionInputs` as `unspentOutputs` with the target exactly equal to their
  sum minus fee, so the existing `selectInputs` (`sdk:src/transactions.ts:399`)
  selects **all** of them (no dust skipping inside the bucket — pass
  `dustThreshold: 0`). Everything downstream (decompose → outputs ≤ 8 digits,
  ring assembly, prefix hash, ring sigs, serialize) is the existing
  `buildTransaction` pipeline (`sdk:src/transactions.ts:508-634`) unchanged.
- **Size shrink-to-fit loop** lives in the wrapper (§2c step 4): compute the
  approximate size; if `> maxTxSize` and inputs still `> minInputCount`, drop the
  largest input and rebuild. Port `getApproximateTransactionSize` /
  `getApproximateMaximumInputCount` as SDK helpers (`Currency.ts:84-126`).
- **Validate post-conditions** (throw, matching legacy messages): inputs `≥ 12`,
  `outputs.length > 0`, `outputs.length <= maxOutputs (8)`
  (`Wallet.ts:1272-1280`).

Broadcast + mempool refresh stay in the app layer (mirror
`settings-operations.ts:226-236`): the SDK returns the signed `BuiltTransaction`
(`serialized`/`hash`), the caller sends it via `daemon.sendRawTx`.

### 4d. Helper to export
`getApproximateMaximumInputCount(maxTxSize, outputCount, mixin)` and
`getApproximateTransactionSize(vin, vout, mixin)` — direct ports of
`Currency.ts:84-126` (the byte-size model + size constants `Currency.ts:16-30`).
`buildFusionTransaction` uses the former to default `maxInputCount` and the latter
for the shrink loop.

### Service-layer wiring (unchanged contract)
`lib/services/real/settings.service.ts` swaps its `settings-operations` calls for
SDK ones once the engine flag is on; the interface (`settings.service.ts:6-7`),
the mock (`mock/settings.service.ts:46-53`), and the `OptimizationStatus` /
`OptimizeWalletResult` types (`lib/types/index.ts:186-194`) **do not change** —
the spine rule (interface + both impls) is already satisfied; only the real impl's
internals move.

---

## 5. Constants + gating

Port these as named SDK constants (today scattered across `config.ts`,
`Currency.ts`, `wallet-network-scalars.mjs`). Values are mainnet CCX:

| Constant | Value | Source |
|---|---|---|
| `FUSION_TX_MIN_INPUT_COUNT` | `12` | `Currency.ts:41` |
| `FUSION_TX_MAX_INPUT_COUNT` | `100` (C++ default; **not** gated on in JS — informational) | `Currency.ts:42` |
| `FUSION_TX_MIN_IN_OUT_COUNT_RATIO` | `4` | `Currency.ts:43`, `config.ts:113` |
| `MAX_FUSION_OUTPUTS` | `8` | `config.ts:114` |
| `FUSION_TX_MAX_SIZE` | `30000` (= `100000 * 30 / 100`) | `Currency.ts:30,40` |
| `OPTIMIZE_OUTPUTS` | `100` (status gate + bucket-ready count) | `config.ts:108` |
| `OPTIMIZE_THRESHOLD` | `900000000` atomic | `config.ts:109` |
| `DEFAULT_MIXIN` | `5` (ring = `mixin+1 = 6`) | `config.ts:107` |
| `MINIMUM_FEE_V2` | `1000` atomic (fusion fee) | `config.ts:103`, `scalars.mjs:5` |
| `DUST_THRESHOLD` | `10` atomic | `config.ts:106`, `scalars.mjs:8` |
| `UPGRADE_HEIGHT_V4` | `45000` | `config.ts:101` |
| `COIN_UNIT_PLACES` | `6` | `scalars.mjs:3` |
| `PRETTY_AMOUNTS` | `{1..9}×10^k` ladder | `config.ts:147-172` |
| `NUM_BUCKETS` | `20` | `Wallet.ts:1031,1073` |
| size-model constants | `KEY_IMAGE_SIZE 32`, `OUTPUT_KEY_SIZE 32`, `AMOUNT_SIZE 10`, `SIGNATURE_SIZE 64`, `PUBLIC_KEY_SIZE 32`, `CRYPTONOTE_BLOCK_GRANTED_FULL_REWARD_ZONE 100000`, … | `Currency.ts:16-30` |

Gating (must all hold before a fusion is attempted):
- **Status gate**: `unspentOutputs >= OPTIMIZE_OUTPUTS (100)` AND some bucket has
  `≥ 100` ready outs at some threshold ≤ balance (`isOptimizationNeeded` true).
- **Build gate**: a bucket with `≥ FUSION_TX_MIN_INPUT_COUNT (12)` eligible
  pretty-amount outs exists; `estimateFusionInputsCount >= 12`; `threshold >
  DUST_THRESHOLD`.
- **Size gate**: serialized size `<= FUSION_TX_MAX_SIZE (30000)` (shrink-to-fit).
- **Output gate**: `outputs.length <= MAX_FUSION_OUTPUTS (8)`.
- **Spend gate** (app layer, unchanged): view-only wallets can't optimize —
  `assertRealWalletCanSpend(walletCopy.viewOnlyOptimizeDisabled)`
  (`real/settings.service.ts:23`).

The on-chain fusion-flag heuristic (`TransactionsExplorer.ts:745-752`) is a
**read/scan** concern (labeling received txs), not part of the builder; it belongs
with the SDK scan/mapper port, not `buildFusionTransaction`. Keep its constants
(`FUSION_TX_MIN_INPUT_COUNT`, `MAX_FUSION_OUTPUTS`, `FUSION_TX_MIN_IN_OUT_COUNT_RATIO`,
`MINIMUM_FEE_V2`) consistent across both so a tx the SDK builds round-trips to
`fusion === true` on scan.

---

## Risks / notes
- **No live broadcast in SDK tests** (same bar as `buildTransaction`,
  `sdk:src/transactions.ts:504-507`): byte-exact serialization via lib-js is the
  correctness bar; broadcast stays app-side and is exercised by Phase 1.
- **Determinism**: inject `shuffle`/`order` seams (mirror `selectInputs`) so the
  bucket pick and down-sample are reproducible in unit tests, defaulting to the
  live shuffle in production.
- **`fee === 0 || minimumFee_V2`** in the scan flag (`TransactionsExplorer.ts:752`)
  means a future zero-fee fusion would still scan as fusion; the builder today
  always uses `MINIMUM_FEE_V2`, so keep `fee` defaultable but document that only
  `0` or `1000` round-trip to the fusion label.
- **Multiple rounds**: one `optimizeWallet` clears one bucket; the UI may surface
  "still needed" afterward. The SDK API is single-round by design (matches
  `optimizeWalletOperation`); looping is an app/service decision.
