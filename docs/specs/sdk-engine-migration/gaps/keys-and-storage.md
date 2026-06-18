# SDK Gap Spec — Key Normalization & Encrypted Wallet Envelope

Status: draft (read-only analysis, 2026-06-19). Scope: port two wallet-core
capabilities into `conceal-wallet-sdk` so the app can **open and save the
existing v1-compatible `"wallet"` blob in IndexedDB with NO `lib/wallet-core`
dependency**:

- **(A)** Legacy **key normalization** — `KeysRepository.normalizeKeys` /
  `fromPriv` / partial-shape handling.
- **(B)** The **encrypted wallet envelope** — `WalletRepository`
  encrypt/decrypt of the stored blob, plus the full serialized JSON shape.

File refs use `app:` for `conceal-next-wallet/lib/wallet-core/*` and `sdk:` for
`conceal-wallet-sdk/src/*`.

---

## 1. Key-normalization rules (exact)

Source: `app:keys-normalize.ts` (pure shape analysis) +
`app:KeysRepository.ts` (crypto) + the inline key paths in
`app:Wallet.ts:248-272` (`loadFromRaw`).

### 1.1 Canonical key shape (`UserKeys`)

`app:KeysRepository.ts:22-31`:

```ts
type UserKeys = {
  pub:  { view: string; spend: string };
  priv: { spend: string; view: string };   // hex, 64 chars each
};
```

### 1.2 Rebuilding pub from priv (`fromPriv`)

`app:KeysRepository.ts:34-47` — pub keys are `sec_key_to_pub` of the secrets:

```ts
fromPriv(spend, view) = {
  pub:  { view: sec_key_to_pub(view), spend: sec_key_to_pub(spend) },
  priv: { spend, view },
};
```

`CnUtils.sec_key_to_pub === concealjs.cnutils.sec_key_to_pub`
(`app:Cn.ts:322-326`). **Available in the SDK today** as
`crypto.cnutils.sec_key_to_pub` (`sdk:crypto.ts:68`; confirmed exported by
lib-js `cnutils`). No new primitive required for (A).

### 1.3 Partial-shape decision table (`analyzeKeysShape`)

`app:keys-normalize.ts:26-65`. Input is the decrypted `raw.keys` object.
Returns one of `ready` / `derive_pub {spend,view}` / `invalid`.

| Input shape | Result | Notes |
|---|---|---|
| not an object / null | `invalid` | `:27-29` |
| has `priv` **and** `pub`, both `pub.spend` & `pub.view` truthy | `ready` (pass through as-is) | `:55` |
| has `priv` & `pub`, `pub` incomplete, **`priv.spend !== ""`** | `derive_pub {priv.spend, priv.view}` → `fromPriv` | `:39-42` (most common partial: full secrets, missing/partial pub) |
| has `priv` & `pub`, `pub` incomplete, `priv.spend === ""`, but `pub.spend` truthy | `ready` with `priv={spend:"", view}`, `pub={spend, view:pub.view ?? ""}` | `:43-51` — **view-only** path (no spend secret) |
| has `priv` & `pub`, `pub` incomplete, `priv.spend === ""`, no `pub.spend` | `invalid` | `:52` |
| no `priv`/`pub`, but `{spend:{sec}, view:{sec}}` | `derive_pub {spend.sec, view.sec}` → `fromPriv` | `:58-62` — legacy v0 `{spend:{sec},view:{sec}}` flat shape |
| anything else | `invalid` | `:64` |

`normalizeKeys` (`app:KeysRepository.ts:50-55`) maps:
`ready → keys`; `derive_pub → fromPriv(spend, view)`; `invalid → null`.

### 1.4 `encryptedKeys` string fallback (legacy v0/v1, pre-`keys`)

`app:Wallet.ts:249-269` — when the decrypted blob has a non-empty
**`encryptedKeys` string** instead of a `keys` object:

- length `128` (= `privView||privSpend`, 2×64 hex): `privView = [0:64]`,
  `privSpend = [64:128]` → `fromPriv(privSpend, privView)`.
- otherwise (length `192`, view-only export): `privView=[0:64]`,
  `pubView=[64:128]`, `pubSpend=[128:192]` → `keys = { pub:{view:pubView,
  spend:pubSpend}, priv:{view:privView, spend:""} }`.

The SDK must replicate **both** byte slicings to open the oldest wallets.

### 1.5 `normalizeKeys` is applied in two places

1. `app:Wallet.ts:270-271` inside `loadFromRaw` — `wallet.keys =
   normalizeKeys(raw.keys) ?? raw.keys` (falls back to raw on null).
2. `app:WalletRepository.ts:108-112` after `loadFromRaw` — re-normalize when
   `!wallet.keys?.pub?.spend`; returns `null` (open failure) if normalize
   fails. The SDK opener must mirror this **defense-in-depth** ordering.

### 1.6 View-key derivation (create/restore — already in SDK)

`app:Cn.ts:721-756 create_address`: for a 64-char reduced seed,
`spend.sec = generate_keys(seed).sec` and **`view.sec =
generate_keys(cn_fast_hash(spend.sec)).sec`**; for shorter input,
`first = cn_fast_hash(seed)` and `second = cn_fast_hash(first)`. The SDK
already wraps this via `crypto.create_address` (`sdk:crypto.ts:27-29`,
`sdk:account.ts:17-49`). **No gap** — listed only so the opener can validate a
restored `priv` against a stored address.

---

## 2. Encrypted wallet envelope (EXACT byte/JSON layout)

Source: `app:WalletRepository.ts` (cipher + KDF + framing),
`app:Wallet.ts:92-296` + `app:Transaction.ts` (inner JSON), `app:Storage.ts`
(IndexedDB record). Storage key is the string `"wallet"`.

### 2.1 Storage record (IndexedDB)

`app:Storage.ts:59-191`: DB `mydb`, object store `storage`, `keyPath: "key"`,
version `2`. The wallet is stored as `{ key:"wallet", value: <string> }`
where `value` is `JSON.stringify(envelope)` (`app:WalletRepository.ts:129-134`
`save`). On open, `getItem("wallet")` → `JSON.parse` → envelope
(`:119-127`). A `localStorage` fallback under the same `"wallet"` key exists
(`app:Storage.ts:27-57,196-222`). There is also a legacy `StorageOld` →
`Storage` migration (`app:WalletRepository.ts:30-58`,
`app:stored-wallet-check.ts`) — best-effort copy then delete; the SDK opener
can ignore `StorageOld` (DOM-specific) and just read key `"wallet"`.

### 2.2 Cipher & KDF

`app:WalletRepository.ts:60-117` (decode) / `:137-168` (encode):

- **Cipher: `nacl.secretbox`** = **XSalsa20-Poly1305** (tweetnacl). NOT a
  CryptoNote primitive. **lib-js `cypher` only exposes
  `chacha8/12/20`** — there is **no secretbox in lib-js or the SDK today**
  (confirmed: `cypher` keys = `['chacha12','chacha20','chacha8']`). This is
  the hard dependency gap for (B): the SDK must add `tweetnacl` (or a vendored
  XSalsa20-Poly1305 + Web-Crypto-free Poly1305) — see §4.
- **KDF: none — the password IS the 32-byte key**, normalized as:
  - if `len > 32`: `password = password.slice(0,32)` (`:64,138`);
  - if `len < 32`: **left-pad with ASCII `'0'` to 32**:
    `("0"×32 + password).slice(-32)` (`:65-67,139-141`);
  - `key = utf8Encode(password)` (`new TextEncoder().encode`,
    `app:WalletRepository.ts:25-27`);
  - **cyrillic fix**: if the utf8 byte length `> 32`, `key = key.slice(-32)`
    (`:71-73,146-148`). (Char-length is checked first, byte-length second —
    a non-latin password can produce >32 bytes after the char clamp.)
- **Nonce: 24 bytes** (`nacl.secretbox.nonceLength`). Generated as
  `nacl.util.encodeBase64(nacl.randomBytes(16))` → a **24-char base64 string**
  (`rawNonce`, `:150`), then the nonce passed to secretbox is
  `utf8Encode(rawNonce)` = the **24 ASCII bytes of that base64 string**
  (`:151,76`). i.e. the random material is 16 bytes but the *effective nonce*
  is the 24-byte UTF-8 of its base64. The SDK must reproduce this exactly
  (don't base64-decode the nonce — encrypt/decrypt against the literal ASCII
  bytes of `nonce`). `rawNonce` is what is stored in the envelope.

### 2.3 Envelope shapes (two formats — version by presence of `data`)

Detected at `app:WalletRepository.ts:81`: **if `rawWallet.data !== undefined`
→ new format**, else old format.

**New ("RawFullyEncryptedWallet")** — `app:Wallet.ts:115-118`, written by all
current saves:

```jsonc
{ "data": number[],   // secretbox ciphertext bytes (each 0–255) as a JSON array
  "nonce": "<24-char base64 string>" }   // rawNonce
```
Decode: `cipher = Uint8Array(data)`; `plain = secretbox.open(cipher,
utf8(nonce), key)`; `plain` is UTF-8 JSON → `JSON.parse` → the `RawWallet`
(`:84-93`). On `secretbox.open === null` → wrong password (return `null`,
`:87`).

**Old ("RawWallet" inline)** — `app:WalletRepository.ts:94-104`: the stored
object IS a `RawWallet` whose **`encryptedKeys` field is `number[]`** (only the
keys are encrypted; the rest of the blob is plaintext). Decode: decrypt
`encryptedKeys` → replace it with the decrypted UTF-8 string → use that object
as `decodedRawWallet`. The SDK must support read of this for old wallets
(write is always new format).

### 2.4 Post-decrypt validation (open gate)

`app:WalletRepository.ts:106-115`: build via `Wallet.loadFromRaw`; if
`!wallet.keys?.pub?.spend` run `normalizeKeys` (null → fail); then
**reject if `wallet.coinAddressPrefix !== config.addressPrefix`**
(`:113`) — wrong-network guard (CCX prefix). The SDK opener needs the CCX
address prefix value (from lib-js/config) to replicate this.

### 2.5 Inner `RawWallet` JSON (what the SDK must serialize/deserialize)

`app:Wallet.ts:92-114` (type) + `:150-296` (export/load). Field-by-field:

```jsonc
{
  "deposits":      RawDeposit[],     // Deposit.export()  app:Transaction.ts:431-437
  "withdrawals":   RawBanking[],     // Withdrawal.export (BaseBanking)  :375-388
  "transactions":  RawTransaction[], // Transaction.export()  :199-229
  "txPrivateKeys": { [txid]: hex },  // app:Wallet.ts:134,189
  "lastHeight":    number,           // = scanned height  :190,248
  "nonce":         "",               // ALWAYS "" inside the plaintext blob  :191
  "keys":          UserKeys,         // §1.1  :196 (or legacy "encryptedKeys" string §1.4)
  "creationHeight":number,           // omitted when 0  :198-200,273
  "options": { readSpeed, checkMinerTx, customNode, nodeUrl },  // app:Wallet.ts:49-82
  "coinAddressPrefix": <any>,        // CCX prefix; defaults to config  :193,278-280
  "addressBook":   RawAddressEntry[],// v3 only, omitted when empty  :202-204,282-284
  "sentMessages":  RawSentMessageRecord[] // v3 only, omitted when empty  :206-212,286-290
}
```

Sub-shapes:

- **`RawTransaction`** (`app:Transaction.ts:199-229`): always
  `{ blockHeight, txPubKey, timestamp, hash }`; optional-when-nonempty
  `ins[]`, `outs[]`, `paymentId`, `message`, `fees`, `fusion`,
  `messageViewed`, `ttl`, `remoteAddress`, `minerReward`. **Sender message
  bodies are stripped from tx entries when a `sentMessages` record exists**
  (`app:Wallet.ts:163-167`).
  - **`outs[]`** (`TransactionOut.export` `:70-86`): always
    `{ keyImage, outputIdx, globalIndex, amount, type, term }`; optional
    `rtcOutPk, rtcMask, rtcAmount, ephemeralPub, pubKey`.
  - **`ins[]`** (`TransactionIn.export` `:126-134`):
    `{ outputIndex, keyImage, amount, term, type }`.
- **`RawDeposit`** (`Deposit.export` `:431-437` over `BaseBanking.export`
  `:375-388`): `{ term, txHash, amount, interest, timestamp, blockHeight,
  unlockHeight, globalOutputIndex, indexInVout, txPubKey, spentTx,
  withdrawPending, keys[] }`.
- **`RawAddressEntry`** (`app:Wallet.ts:84-90`):
  `{ id, label, address, paymentId?, avatar? }`.
- **`RawSentMessageRecord`**: re-exported from `app:sent-messages.ts`
  (`{ txHash, ... }`, `app:Wallet.ts:120`). v3-only; v1 `loadFromRaw` ignores
  it (`:108-114` comments) → forward/backward compatible.

`txsMem` (mempool) is merged into `transactions` on export, de-duped by hash &
txPubKey, and `sentMessages` are pruned to confirmed/ttl-expired only
(`app:Wallet.ts:170-212`).

---

## 3. SDK coverage vs gaps

| Capability | SDK today | Gap |
|---|---|---|
| Create/restore account, keys, address | `sdk:account.ts`, `sdk:crypto.ts` (`create_address`, `sec_key_to_pub`) | none |
| Mnemonic encode/decode/detect | `sdk:mnemonic.ts` | none |
| View-key derivation | via `create_address` (§1.6) | none |
| Address encode/decode (incl. integrated) | `sdk:address.ts` | none |
| **Key normalization (partial/v0/v1/view-only)** | — none — | **(A) MISSING** |
| **`encryptedKeys` string slicing (128/192)** | — none — | **(A) MISSING** |
| In-memory wallet state model + serialize | `sdk:wallet.ts` (`WalletState`, `serialize/deserializeWalletState`, version `1`) | **different schema** from v1 `RawWallet` (slimmer: only `address, scannedHeight, outputs, spentKeyImages, transactions`). Does NOT model deposits/withdrawals/txPrivateKeys/keys/options/addressBook/sentMessages |
| Persistence boundary | `sdk:adapters.ts` (`StorageAdapter`, memory/web/namespaced) + `sdk:sync.ts` key `"conceal-wallet-state"` | adapter is fine, but the **key is wrong** (`conceal-wallet-state` ≠ `"wallet"`) and the **payload is the SDK schema, not the encrypted v1 envelope** |
| **XSalsa20-Poly1305 secretbox (envelope cipher)** | — none — (lib-js `cypher` = chacha8/12/20 only) | **(B) MISSING — needs `tweetnacl` dep or vendored secretbox** |
| **Password→key KDF (clamp/pad/cyrillic)** | — none — | **(B) MISSING** |
| **Envelope read/write (`data`/`nonce`, old inline format)** | — none — | **(B) MISSING** |
| Wrong-network prefix guard | implicit in `decode_address`; not at open | **(B) MISSING at open** |

Net: the SDK's `serialize/deserializeWalletState` is a **parallel, slimmer
model** for the SDK's own sync layer — it is **not** the v1 envelope and must
not be conflated with it. (A) and (B) are net-new modules.

---

## 4. Concrete SDK API to add

Goal: app opens/saves the existing `"wallet"` blob via the SDK only.

### 4.1 New dependency

Add **`tweetnacl`** to `sdk:package.json` for `secretbox`/`secretbox.open`
+ `randomBytes`, and replicate the base64-nonce trick without
`nacl.util` (`tweetnacl-util` or a tiny inline base64). Alternatively vendor a
focused XSalsa20-Poly1305; `tweetnacl` is the lowest-risk match to wallet-core.

### 4.2 `src/keys.ts` (capability A)

```ts
export interface UserKeys { pub:{view:Hex;spend:Hex}; priv:{spend:Hex;view:Hex} }

// pub = sec_key_to_pub(priv)  — uses crypto.cnutils
export function userKeysFromPriv(spend: Hex, view: Hex): UserKeys;

// Pure shape analysis (port of analyzeKeysShape) — no crypto, unit-testable.
export type KeysShape =
  | { kind:"ready"; keys:UserKeys }
  | { kind:"derive_pub"; spend:Hex; view:Hex }
  | { kind:"invalid" };
export function analyzeKeysShape(keys: unknown): KeysShape;

// ready→keys, derive_pub→userKeysFromPriv, invalid→null
export function normalizeUserKeys(keys: unknown): UserKeys | null;

// Decode legacy encryptedKeys string (128 → fromPriv; 192 → view-only).
export function userKeysFromEncryptedKeysString(s: string): UserKeys | null;
```

Port rules verbatim from §1.3–§1.4; keep `analyzeKeysShape` crypto-free so the
existing wallet-core unit tests transfer 1:1.

### 4.3 `src/envelope.ts` (capability B — documented v1 codec)

```ts
export const WALLET_STORAGE_KEY = "wallet";   // matches IndexedDB key

// The inner v1 plaintext blob (superset; v3 fields optional).
export interface RawWalletV1 { /* §2.5 full shape */ }

export type EncryptedWalletEnvelope =          // §2.3
  | { data: number[]; nonce: string }                 // new (RawFullyEncryptedWallet)
  | (RawWalletV1 & { encryptedKeys: number[] });       // old inline

// Pure codec (no storage): password + envelope JSON  →  RawWalletV1.
// Returns null on wrong password (secretbox.open === null) or bad JSON.
export function openEncryptedWallet(
  envelope: EncryptedWalletEnvelope, password: string,
  opts?: { expectedAddressPrefix?: number },   // §2.4 wrong-network guard
): { raw: RawWalletV1; keys: UserKeys } | null;

// Pure codec: RawWalletV1 + password → new-format envelope (always writes `data`).
export function saveEncryptedWallet(raw: RawWalletV1, password: string): EncryptedWalletEnvelope;

// Exposed for tests / reuse:
export function normalizeWalletPassword(pw: string): Uint8Array;   // §2.2 clamp/pad/cyrillic
```

Behavioral contract (must match wallet-core byte-for-byte):

- `openEncryptedWallet` runs §2.2 KDF, branches on `data` presence (§2.3),
  `secretbox.open` with `utf8(nonce)`, `JSON.parse`, then **applies
  `normalizeUserKeys`** when `pub.spend` missing and the `encryptedKeys`-string
  path (§1.4); rejects on prefix mismatch (§2.4).
- `saveEncryptedWallet` always emits `{ data:number[], nonce:rawNonce }` with
  `rawNonce = base64(randomBytes(16))` then `secretbox(utf8(json), utf8(nonce),
  key)`; `data` is `Array.from(cipher)`.

### 4.4 Storage glue (optional convenience)

```ts
// Read/write the "wallet" record through a StorageAdapter (host supplies an
// IndexedDB-backed adapter matching app:Storage.ts: db "mydb"/store "storage").
export async function openStoredWallet(s: StorageAdapter, password: string): Promise<…|null>;
export async function saveStoredWallet(s: StorageAdapter, raw, password): Promise<void>;
export async function hasStoredWallet(s: StorageAdapter): Promise<boolean>;  // getItem("wallet")!==null
```

These read/write `StorageAdapter.getItem("wallet")` as `JSON.stringify(envelope)`
— so the app drops `WalletRepository`/`Storage`/`KeysRepository` and depends
only on the SDK. (The app's IndexedDB adapter must use db `mydb` / store
`storage` / `keyPath:"key"` to hit the same records — §2.1.)

### 4.5 Exports

Add all of the above to `sdk:index.ts` alongside the existing
`createWalletState`/`serializeWalletState` block.

---

## 5. Compatibility risks (existing stored wallets MUST still open)

1. **Cipher fidelity.** secretbox is XSalsa20-Poly1305 with a 24-byte nonce.
   The wallet-core nonce is the **24 ASCII bytes of `base64(16 random bytes)`**
   — NOT the decoded 16 bytes. Decoding the nonce, or using a 16-byte nonce,
   silently fails every existing wallet. Encrypt/decrypt against `utf8(nonce)`.
2. **Password KDF fidelity.** The order is: char-clamp to 32 → left-pad with
   ASCII `'0'` → UTF-8 encode → byte-slice last 32 if >32. Any deviation
   (right-pad, zero-byte pad, hashing the password, UTF-16) breaks every
   wallet. Preserve the cyrillic byte-slice branch (`app:WalletRepository.ts:71-73`).
3. **Both envelope formats.** Old wallets store the inline `RawWallet` with an
   encrypted `encryptedKeys` array (§2.3 old). New code writes only the `data`
   format. The opener MUST read both; the saver only needs to write `data`.
4. **`encryptedKeys` string shapes (128/192) + flat `{spend:{sec}}` v0.** The
   oldest wallets predate the `keys` object. Skipping §1.4 / the last row of
   §1.3 strands those users. Migrate keys to canonical `UserKeys` on open but
   re-save in new format only when the user explicitly re-saves.
5. **View-only wallets.** `priv.spend === ""` is valid (`isViewOnly`,
   `app:Wallet.ts:298-300`). normalize must NOT treat empty spend as invalid
   when `pub.spend` is present (§1.3 view-only row). `downloadEncryptedPdf`
   throwing `missing_spend` is app UI, not an open gate.
6. **Wrong-network guard.** Keep the `coinAddressPrefix !== prefix` rejection
   (§2.4) so a foreign-network blob doesn't open as CCX; source the CCX prefix
   from config/lib-js, not a hardcoded literal.
7. **`nonce:""` inside the plaintext blob.** `RawWallet.nonce` is always the
   empty string inside the JSON (`app:Wallet.ts:191`); the *real* nonce lives
   only in the envelope. Don't confuse the two when round-tripping.
8. **Lossless round-trip of v3 fields.** Preserve `addressBook` / `sentMessages`
   / `txPrivateKeys` / `options` / `deposits` / `withdrawals` on
   open→save, or saving from the SDK silently drops user data that the app's
   `RawWallet` model carries. The SDK's slim `WalletState` is insufficient as
   the envelope payload — use the full `RawWalletV1` (§2.5).
9. **Storage key + IndexedDB coordinates.** The record key is `"wallet"` in db
   `mydb` / store `storage` (`keyPath:"key"`), not the SDK's
   `"conceal-wallet-state"`. The app's adapter must target those exact
   coordinates or it won't see existing wallets; localStorage fallback uses the
   same `"wallet"` key.
10. **secretbox dependency provenance.** `tweetnacl` is a new external dep —
    note `.npmrc min-release-age=7` and SHA/lockfile review; or vendor a
    minimal XSalsa20-Poly1305 to avoid the dep. lib-js cannot supply this
    (chacha-only).
```