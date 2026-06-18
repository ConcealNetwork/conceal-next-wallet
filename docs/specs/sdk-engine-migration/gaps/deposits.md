# SDK Port Spec — Deposits / Banking (CryptoNote type-03)

Read-only analysis. Goal: port Conceal deposit (lock) + withdrawal (unlock) tx
construction, interest, scanning, and constraints from `lib/wallet-core` into
`conceal-wallet-sdk`. All `file:line` refs are to the repos as read on
2026-06-19. **No source was modified.**

Naming: legacy "deposit" = lock CCX for a term; "withdrawal" = redeem an unlocked
deposit (principal + interest). On chain: a deposit is a **type-`03`
`txout_to_deposit_key`** output; a withdrawal spends it via a **type-`03`
`input_to_deposit_key`** input.

---

## 1. Exact deposit-tx and withdrawal-tx structure

### Tx version + unlock_time

- `version = DEPOSIT_TX_VERSION = 2` for ALL non-regular txs (deposit AND
  withdraw); regular spends are `version = 1`. `lib/wallet-core/Cn.ts:72,74`;
  set at `Cn.ts:2070-2072` (`if (transactionType !== "regular") tx.version = 2`).
  NOTE: the SDK's `buildTransaction` hardcodes `version: 1`
  (`transactions.ts:575`) and the lib-js deposit test vector uses `version: 1`
  (`test-transactions.js:404`) — that test only exercises the serializer wire
  format, not consensus. **The SDK deposit/withdraw builders MUST emit
  `version: 2`.**
- `unlock_time = 0` for deposits and withdrawals. The lock duration is carried
  by the per-output/per-input **`term`** field, NOT by `unlock_time`. (Cn.ts
  `construct_tx` never sets `unlock_time` for deposits; serializer test asserts
  `unlockTime === 0`, `test-transactions.js:450`.) The deposit's effective
  unlock height is computed off-chain as `blockHeight + term` (§2).

### DEPOSIT (lock) — one type-03 vout

Built by `TransactionsExplorer.createTx(..., transactionType="deposit", term)`
→ `createRawTx` → `CnTransactions.create_transaction`/`construct_tx`.

- Caller: `createDepositOperation` (`wallet-operations.ts:656-729`). Destination
  is the wallet's OWN address (`destinationAddress = wallet.getPublicAddress()`,
  `:688`), amount = `amountCoins * 10^coinUnitPlaces`, fee = `config.coinFee`
  (1000 atomic). `transactionType="deposit"`, `term = months * depositMinTermBlock`.
- Destination splitting: the deposit destination (`dsts[0]`) is kept **intact /
  not decomposed**; only the remaining (change/fee) destinations are
  power-of-ten decomposed (`TransactionsExplorer.ts:879-892`). Deposit output is
  always `vout[0]`.
- **vout[0]** (`Cn.ts:2227-2244`, the `transactionType==="deposit" && i===0`
  branch):
  ```
  { amount: <depositAtomic>,
    target: { type: "txout_to_deposit_key",
              data: { keys: [out_ephemeral_pub],   // single one-time key
                      required_signatures: 1,
                      term: <termBlocks> } } }
  ```
  `out_ephemeral_pub = derive_public_key(out_derivation, out_index, destKeys.spend)`
  where `out_derivation = generate_key_derivation(destKeys.view, txkey.sec)`
  (own address ⇒ change-path derivation, `Cn.ts:2209-2215,2225`).
- **vout[1..]**: change as ordinary `txout_to_key` (type `02`), built right after
  by reusing `out_index+1` (`Cn.ts:2241-2255`).
- **vin**: ordinary `input_to_key` (type `02`) ring inputs selected from the
  wallet's non-type-03 outputs (`formatWalletOutsForTx` skips `out.type==="03"`,
  `TransactionsExplorer.ts:813-815`), `mixin = config.defaultMixin`, signed with
  normal ring signatures (`Cn.ts:2354-2362`).
- A deposit tx therefore = normal spend ring inputs + one type-03 deposit output
  + optional type-02 change. Interest is NOT in the tx; it is computed at
  scan/withdraw time.

### WITHDRAW (unlock) — one type-03 vin, NO decoys

Built by `TransactionsExplorer.createWithdrawTx(deposit, ..., transactionType="withdraw", term=deposit.term)`
(`TransactionsExplorer.ts:1159-1279`) → `createRawTx` → `construct_tx`.

- Caller: `withdrawDepositOperation` (`wallet-operations.ts:731-807`). Guards:
  deposit exists, not spent, not `withdrawPending`, and
  `unlockHeight <= blockchainHeight` (`:748-756`). Sets `withdrawPending=true`
  in the confirm callback, rolls back on failure.
- **mixin = 0** (no decoys); `obtainMixOutsCallback` returns `[]`
  (`wallet-operations.ts:764`). Single input, ring size 1.
- **The spent "output"** is synthesized from the stored `Deposit`
  (`TransactionsExplorer.ts:1206-1217`):
  ```
  { keyImage: "", amount: deposit.amount,
    public_key: deposit.keys[0], index: deposit.indexInVout,
    global_index: deposit.globalOutputIndex, tx_pub_key: deposit.txPubKey,
    type: "input_to_deposit_key", required_signatures: 1,
    keys: [deposit.keys[0]] }
  ```
- **vin[0]** (`Cn.ts:2125-2134`, `transactionType==="withdraw"` branch):
  ```
  { type: "input_to_deposit_key",
    amount: <deposit.amount>,            // PRINCIPAL only (uint64; pass as string if large)
    term: <deposit.term>,
    outputIndex: real_out_in_tx,         // = deposit.globalOutputIndex (Cn.ts:2580)
    signatures: 1,
    k_image: <unused — not serialized>,
    key_offsets: [] }
  ```
  Inputs are NOT sorted/key-imaged for withdraw (`Cn.ts:2083,2118` skip the
  withdraw branch).
- **vout**: a single ordinary `txout_to_key` (type `02`) to the wallet's own
  address for `changeAmount = principal + interest − withdrawFee`
  (`TransactionsExplorer.ts:1179-1231`).
- **Amount semantics**: the type-03 vin amount is the **principal**
  (`deposit.amount`); the redeemed `principal + interest` flows out via the type-02
  vout. Fee = `config.depositSmallWithdrawFee = 10` atomic
  (`TransactionsExplorer.ts:1193`), NOT the normal 1000 coinFee.
- **Signature**: NOT a ring signature. Per-input **single `generate_signature`**
  over an ephemeral key pair re-derived from the deposit's source tx
  (`Cn.ts:2363-2421`):
  `derivation = generate_key_derivation(deposit.txPubKey, view.sec)` →
  `ephPub = derive_public_key(derivation, outputIndex, spend.pub)`,
  `ephSec = derive_secret_key(derivation, outputIndex, spend.sec)` →
  `sig = generate_signature(txPrefixHash, ephPub, ephSec)`; verified with
  `verify_signature` before attaching. `tx.signatures.push([sig])` (exactly one
  sig per type-03 vin).

### vin/vout target-type quick table

| | regular spend | deposit (lock) | withdraw (unlock) |
|---|---|---|---|
| version | 1 | **2** | **2** |
| unlock_time | 0 | 0 | 0 |
| vin type | `02` input_to_key | `02` input_to_key | **`03` input_to_deposit_key** (term, outputIndex) |
| vout type | `02` txout_to_key | **`03` txout_to_deposit_key** (keys[1], req_sig=1, term) + `02` change | `02` txout_to_key (principal+interest−fee) |
| mixin | defaultMixin | defaultMixin | **0** |
| sig | ring | ring | **single generate_signature** |
| fee | 1000 | 1000 | **10** (depositSmallWithdrawFee) |

---

## 2. Interest formula + unlock-time (EXACT)

Source: `lib/wallet-core/Interest.ts` (`InterestCalculator.calculateInterest(amount, term, lockHeight)`,
atomic in → atomic out). `amount` = atomic, `term` = blocks, `lockHeight` =
deposit block height.

### Term selection / dispatch (`Interest.ts:60-97`)

1. `lockHeight === 425799` (BLOCK_WITH_MISSING_INTEREST) ⇒ `lockHeight += term`.
2. **V3** if `term % 21900 === 0 && lockHeight > depositHeightV3` (DEPOSIT_HEIGHT_V3=413400):
   `calculateInterestV3`.
3. **V2** else if `term % 64800 === 0 || term % 5040 === 0`: `calculateInterestV2`.
4. **V1** fallback (should not occur on current chain): `Interest.ts:82-96`.

Current-chain deposits are always V3 (term = `months * 21900`,
`previewCreateDepositOperation` `:645`; `createDepositOperation` `:676-679`).

### V3 — monthly (`Interest.ts:105-136`)

```
m_coin       = 10^coinUnitPlaces                     // 1e6
amount4Humans = amount / m_coin
base = depositRateV3[0]=0.029  (<10000)              // tiers, config DEPOSIT_RATE_V3
     = depositRateV3[1]=0.039  (>=10000 && <20000)
     = depositRateV3[2]=0.049  (>=20000)
months = min(term / 21900, 12)
ear  = base + (months - 1) * 0.001
eir  = (ear / 12) * months
interest = floor(amount * eir)                       // atomic
```

### V2 — quarterly investment (`term % 64800 === 0`, `Interest.ts:147-179`)

```
amount4Humans = amount / 1e6
qTier = 1.00..1.15 by 16 amount bands (110k→2M; see :153-167)
mq = config.investmentMq || 1.4473
termQuarters = term / 64800
m8 = 100*(1 + mq/100)^termQuarters - 100
m5 = termQuarters * 0.5
m7 = m8 * (1 + m5/100)
rate = m7 * qTier
interest = floor(amount * rate/100)
```

### V2 — weekly (`term % 5040 === 0`, `Interest.ts:181-191`)

```
weeks = term / 5040
base = config.weeklyBaseInterest || 0.0696
inc  = config.weeklyInterestIncrement || 0.0002
rate = base + weeks * inc
interest = floor(amount * (weeks * rate)/100)
```

### V1 fallback (`Interest.ts:82-96`) — BigInt-exact

```
a = term*DEPOSIT_MAX_TOTAL_RATE(4) - DEPOSIT_MIN_TOTAL_RATE_FACTOR(0)
base = Number( BigInt(trunc(amount))*BigInt(a) / BigInt(100*262800) )   // 262800 = 1*12*21900
interest = lockHeight <= 12750 ? base*100 : base
```
(uses BigInt to stay bit-exact with the daemon's mul128/div128_32; do NOT use
float math here.)

### Unlock-time computation

- **Term**: `termBlocks = months * depositMinTermBlock` where
  `depositMinTermBlock = 21900` (one month). `previewCreateDeposit` `:645`,
  `createDeposit` `:676-679`.
- **unlockHeight** (off-chain, derived, never serialized):
  `unlockHeight = blockHeight + term` — `Transaction.ts:367,425` (BaseBanking /
  Deposit `fromRaw`), `wallet-operations.ts:726`. A deposit is unlocked when
  `currentHeight >= unlockHeight` (`Transaction.ts:453`,
  `Wallet.lockedDeposits`/`unlockedDeposits` `Wallet.ts:858-883` use strict
  `blockHeight + term > currHeight` for locked).
- **Indicative APR** (UI only): `deriveIndicativeDepositApr` (`mappers.ts:404-416`)
  `= (interest/principal) / (months/12) * 100`.

---

## 3. Constraints (min/max, term bounds, gating)

From `lib/config/wallet-network-scalars.mjs` → `lib/config/config.ts`:

| const | value | source |
|---|---|---|
| `coinUnitPlaces` | 6 | scalars (`COIN_UNIT_PLACES`) |
| `coinFee` (deposit-tx fee) | 1000 atomic | `coinFeeAtomic` |
| `depositSmallWithdrawFee` | 10 atomic | scalars :14 |
| `depositMinAmountCoin` | 1 CCX | scalars :10 |
| `depositMinTermMonth` | 1 | scalars :11 |
| `depositMaxTermMonth` | 12 | scalars :13 |
| `depositMinTermBlock` | 21900 (1 month) | scalars :12 |
| `DEPOSIT_RATE_V3` | [0.029, 0.039, 0.049] | config.ts:21 |
| `avgBlockTime` | (scalars) | `AVG_BLOCK_TIME_SECONDS` |

Consensus / dispatch heights (in `Interest.ts`, also config): `depositHeightV3`
413400, `depositHeightV4` (declared but unused in interest), early-multiplier
end block 12750 (100×), special block 425799.

**Create-deposit gating** (`createDepositOperation` `:665-685`):
- `amountCoins >= depositMinAmountCoin` (≥1), finite.
- `depositMinTermMonth <= months <= depositMaxTermMonth` (1..12).
- `amountAtomic + coinFee <= wallet.availableAmount(height)`.
- Confirm callback re-checks `amount >= depositMinAmountCoin * 1e6`
  (`:699-701`).

**getDepositConstraints** (`getWalletDepositConstraints` `mappers.ts:458-476`):
- `maxDepositAmount = floor((availableAmount(height) − coinFee) / 1e6)` (whole coins).
- `isDepositDisabled = isWalletSyncing || maxDepositAmount < depositMinAmountCoin`.
- `isWalletSyncing`, `hasPendingDeposit` (`Wallet.hasPendingDeposit`,
  `Wallet.ts:749`).
- UI duration options = `[1..12]` months (`deposit.service.ts:20-23`).

**Withdraw gating** (`withdrawDepositOperation` `:748-756`): not spent, not
pending, `unlockHeight <= height`; fee `<= availableAmount`.

**Balance interaction**: type-03 outputs/inputs are EXCLUDED from spendable
balance and from input selection — `availableAmount` and `incomingAmount` skip
`type==="03"` (`Wallet.ts:785,792,801,808,825,835`); `formatWalletOutsForTx`
skips them (`TransactionsExplorer.ts:813`). Locked principal lives only in the
`deposits[]` collection (`lockedDeposits`/`unlockedDeposits`).

---

## 4. What lib-js already serializes vs what's missing

**`conceal-lib-js/src/js/transactions.js` ALREADY serializes the full deposit
wire format** (`serializeTransaction`, `:425-531`):

- `input_to_deposit_key` (`:448-455`): emits tag `03`, `encode_varint(amount)`,
  `encode_varint(1)` (req sigs, always 1), `encode_varint(outputIndex)`,
  `encode_varint(term)`.
- `txout_to_deposit_key` (`:474-487`): tag `03`, `encode_varint(keys.length)`,
  each 64-char key, `encode_varint(1)` (req sigs), **`encode_varint_term(term)`**.
- Signature appension (`:503-528`): for `input_to_deposit_key` it forces
  `expectedSignatures = 1` regardless of `vin.signatures` (`:510-513`), so a
  withdraw must attach exactly `[[sig]]`.
- `getTransactionPrefixHash` / `serializeTransactionWithHash` work for deposit
  txs unchanged (`:540-558`).
- `encode_varint_term` exists in `cnutils.js:265-275` (LEB128 of a JSBigInt).
- Scan side: `scanReceiveOutputs` / `buildReceiveOutputChecks` already handle
  type-`03` vouts — for `out.keys[]` it pushes one check per key with the
  derivation index = the OUTPUT index `iOut` (`transactions.js:175-181`),
  matching the legacy type-03 ownership test (`TransactionsExplorer.ts:528-534`).

**MISSING in lib-js**: nothing required for serialization. The deposit
`encode_varint` (vin/vout) test vector exists (`test-transactions.js:399-473`).

**MISSING in the SDK** (`conceal-wallet-sdk/src/transactions.ts`): the entire
deposit/withdraw BUILD path. Current `buildTransaction` (`:508-634`) hardcodes:
- `TxStruct.vin` type `"input_to_key"` only (`:577-582,640`),
- `TxStruct.vout` type `"txout_to_key"` only (`:583-586,641`),
- `version: 1`, `unlock_time: 0` (`:575-576`),
- ring signatures for every input (`:595-611`).
It cannot emit type-03 outputs/inputs, term, version-2, the single-sig withdraw
path, the `txout_to_deposit_key` deposit output, or interest. Scan
(`scanTransactionOutputs` `:155-207`) DETECTS type-03 owned outputs (via
`matchOutputTarget` `:122-125`) but discards the deposit metadata (term, keys,
indexInVout) — it returns a plain `OwnedOutput` with no deposit fields.

---

## 5. Concrete SDK API to add

### 5a. Types (`src/transactions.ts` or new `src/deposits.ts`)

```ts
// Detected deposit output, recovered during scan (superset of OwnedOutput).
export interface OwnedDeposit {
  amount: number;            // principal, atomic
  globalIndex: number;       // = vout global output index (withdraw outputIndex)
  outputIndex: number;       // index within vout (indexInVout; used in sig derivation)
  txPublicKey: Hex;          // R of the deposit tx
  publicKey: Hex;            // the one-time deposit key (keys[0])
  keys: Hex[];               // target.data.keys (single-element for CCX)
  term: number;              // blocks
  blockHeight: number;       // deposit tx height
  txHash: Hex;
  interest: number;          // atomic, = InterestCalculator(amount, term, blockHeight)
  unlockHeight: number;      // blockHeight + term
}

export interface DepositInterestInput { amount: number; term: number; lockHeight: number; }
export function calculateDepositInterest(i: DepositInterestInput): number; // port Interest.ts
```

### 5b. `buildDepositTransaction`

Differs from `buildTransaction` by: amount goes to a type-03 output to the
sender's OWN address, output is NOT decomposed, version=2, `unlock_time=0`,
`term` set, plus normal ring inputs + type-02 change.

```ts
export interface BuildDepositTransactionInput {
  keys: WalletKeys;
  amount: number;                 // deposit principal, atomic
  termBlocks: number;             // months * 21900
  ownKeys: { spendPublicKey: Hex; viewPublicKey: Hex }; // sender = deposit + change recipient
  unspentOutputs: SpendableOutput[];
  decoys: DecoySet[];
  fee: number;                    // 1000
  mixin: number;                  // defaultMixin
  dustThreshold?: number;
}
export function buildDepositTransaction(i: BuildDepositTransactionInput): BuiltTransaction;
```
Implementation notes (mirror `Cn.ts:2227-2257`):
- Select inputs to cover `amount + fee`; change = inputsAmount − amount − fee.
- Deposit output one-time key: `derive_public_key(generate_key_derivation(ownView, r), 0, ownSpend)`.
  The deposit output is `vout[0]`; change is `vout[1]` at the NEXT out_index (not decomposed alongside the deposit).
- `TxStruct` must gain `version: 2` and a vin/vout union admitting
  `txout_to_deposit_key { keys, required_signatures:1, term }`.
- Sign type-02 inputs with `generate_ring_signature` over the prefix hash (unchanged).

### 5c. `buildWithdrawTransaction`

Differs fundamentally: single type-03 input (no ring, no decoys, mixin 0), a
single type-02 output of `principal + interest − withdrawFee` to self, version=2,
single `generate_signature` (NOT ring).

```ts
export interface BuildWithdrawTransactionInput {
  keys: WalletKeys;
  deposit: OwnedDeposit;          // from scan/state
  ownKeys: { spendPublicKey: Hex; viewPublicKey: Hex };
  withdrawFee: number;            // 10 (depositSmallWithdrawFee)
}
export function buildWithdrawTransaction(i: BuildWithdrawTransactionInput): BuiltTransaction;
```
Implementation notes (mirror `Cn.ts:2125-2134, 2363-2421`,
`TransactionsExplorer.createWithdrawTx`):
- vin[0] = `{ type:"input_to_deposit_key", amount: deposit.amount, term: deposit.term,
  outputIndex: deposit.globalIndex, signatures:1 }`.
- vout[0] = `txout_to_key` to self for `deposit.amount + deposit.interest − withdrawFee`.
- Signing: re-derive ephemeral pair from `deposit.txPublicKey` + `deposit.outputIndex`:
  `D=generate_key_derivation(deposit.txPublicKey, view.sec)`,
  `ephPub=derive_public_key(D, deposit.outputIndex, spend.pub)`,
  `ephSec=derive_secret_key(D, deposit.outputIndex, spend.sec)`,
  `sig=generate_signature(prefixHash, ephPub, ephSec)`; verify with
  `verify_signature`; attach `signatures = [[sig]]`.
- prefixHash from `getTransactionPrefixHash` over the version-2 header.

### 5d. Deposit scanning into wallet state

`scanTransactionOutputs` (or a new `scanTransactionDeposits`) must, for each
owned type-03 output, additionally return an `OwnedDeposit` carrying
`term = vout.target.data.term`, `keys`, `indexInVout`, `blockHeight`, `txHash`,
compute `interest` + `unlockHeight`. Mirror `TransactionsExplorer.parse`
`:546-579` (deposit detection on owned type-03 with `target.data.term`).

**Withdrawal detection** (mark deposit spent): a type-03 **vin** in a scanned tx
whose `vin.value.outputIndex` matches an owned deposit's `globalIndex` ⇒ that
deposit is now spent/withdrawn (`TransactionsExplorer.ts:629-672` full-wallet;
`:676-716` view-only matches by owned `globalOutputIndex` only — never by vin
index, to avoid matching other users' unlocks).

**Wallet state additions** (`src/wallet.ts` — currently has NO locked-output
concept): add `deposits: OwnedDeposit[]` + `spentDepositIndexes: number[]` to
`WalletState` (bump `WALLET_STATE_VERSION` from 1, add validators). Balance
(`getBalance` `:153-159`) must KEEP excluding deposit principal from spendable
(type-03 already excluded since deposits aren't `OwnedOutput`s); add derived
`lockedDeposits` / `unlockedDeposits` getters mirroring `Wallet.ts:858-883`
(`blockHeight + term > height` ⇒ locked; `<=` and not spent ⇒ unlocked).

### 5e. Daemon

`getRandomOuts` / `sendRawTransaction` already exist (`src/daemon.ts:76-78,
239,255-357`). Withdrawals need ZERO decoys (call with count 0 / skip
`getRandomOuts`). No new RPC required — deposits are read off the normal tx
scan; there is no dedicated deposit RPC in the legacy explorer either.

---

## 6. Test vectors / reference values

**lib-js deposit serializer vector** (`conceal-lib-js/test/test-transactions.js:399-470`):
- deposit key = `"33"×32` (64 hex chars).
- input: `{ input_to_deposit_key, amount:5000, outputIndex:9, term:21900, signatures:1 }`.
- output: `{ amount:5000, txout_to_deposit_key, keys:[depKey], term:21900 }`.
- header walk asserts wire order: `version, unlock_time, vinCount, vinTag="03",
  vinAmount, vinSigReq=1, vinOutIdx=9, vinTerm=21900, voutCount, voutAmount,
  voutTag="03", keysLen=1, depKey, reqSigCount=1, voutTerm=21900`
  (`:431-463`). `voutTerm` uses `encode_varint_term` (`cnutils.js:265-275`).
- Guard vector (`:371-394`): even-length extra required; deposit commits to
  exactly 1 signature.

**Interest reference values** (recompute, no canned vectors in repo):
- V3, 1 month (term=21900), 10000 CCX (`amount=1e10` atomic), `lockHeight>413400`:
  `base=0.039` (tier ≥10000), `months=1`, `ear=0.039`, `eir=0.039/12=0.00325`,
  `interest = floor(1e10 * 0.00325) = 32_500_000` atomic (32.5 CCX).
- V3, 12 months, 5000 CCX (`amount=5e9`): `base=0.029`, `months=12`,
  `ear=0.029+11*0.001=0.040`, `eir=(0.040/12)*12=0.040`,
  `interest = floor(5e9*0.040)=200_000_000` (200 CCX).
- Mock-UI APR reference (NOT consensus): `DEPOSIT_APR_BY_DURATION_MONTHS`
  `{1:2.9, 3:3.2, 6:3.8, 12:4.6}` (`deposit.service.ts:26-31`).

**Key file refs (build/sign source of truth):**
`Cn.ts:2009-2460` (`construct_tx`), `Cn.ts:2481-2740` (`create_transaction`),
`TransactionsExplorer.ts:842-930` (`createRawTx`), `:932-1157` (`createTx`),
`:1159-1279` (`createWithdrawTx`), `Interest.ts` (interest), `Transaction.ts:347-472`
(`Deposit`), `mappers.ts:403-476` (UI mapping + constraints).
