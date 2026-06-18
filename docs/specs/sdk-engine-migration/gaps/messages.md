# SDK port gap: message TTL + smart-message framing

**Scope.** The SDK (`conceal-wallet-sdk/src/messages.ts`) already has the message
**crypto** — ChaCha8/12 encrypt/decrypt, the 4-byte zero checksum, the ECDH spend-key
derivation, and the full smart-message protocol (`isSmartMessage` /
`encodeSmartMessage` / `parseSmartMessage` / `KNOWN_MODULES`). What it does **not** have
is the **protocol framing around the crypto**: writing the encrypted blob and the TTL
into `tx_extra`, the ~100-atomic self-output convention that marks a tx as a message,
TTL semantics, and reading messages/TTL back out at scan time. This doc specifies that
framing precisely so it can be ported.

Reference source (read-only, do not modify):
- Wallet build side: `lib/wallet-core/Cn.ts:2272-2332` (message + TTL → extra),
  `:76-84` (tag constants).
- Wallet scan side: `lib/wallet-core/TransactionsExplorer.ts:78-93` (constants),
  `:129-179` (`parseExtra`), `:333-414` (`decryptMessage`), `:442-493` (extra walk),
  `:765-781` (decrypt + attach).
- Wallet operation glue: `lib/wallet-core/wallet-operations.ts:477-617`
  (`listMessagesOperation` / `sendMessageOperation` / `markMessageReadOperation`).
- Scalars: `lib/config/wallet-network-scalars.mjs:6,9,21`; `lib/config/config.ts:15,23,25,27`.
- SDK crypto already ported: `conceal-wallet-sdk/src/messages.ts:1-173`.
- SDK build (no message/TTL support today): `conceal-wallet-sdk/src/transactions.ts:574-590`.

---

## 1. Exact tx structure of a message-bearing transaction

A "message" is an **ordinary CryptoNote spend** with three additional conventions. There
is no dedicated tx type; it is detected by the **amount** of its self-output.

### 1a. Outputs — the ~100-atomic self-output convention

A message tx sends a tiny fixed amount to the **recipient** so the recipient's wallet
scans, owns, and decrypts the tx:

- Recipient destination amount = `MESSAGE_TX_AMOUNT_ATOMIC = 100` atomic units
  (`lib/config/wallet-network-scalars.mjs:9`; sender sets it at
  `wallet-operations.ts:515-517`).
- If a remote node fee applies **and there is no TTL**, a second destination pays the
  node fee (`config.remoteNodeFee = 10000` atomic, `wallet-network-scalars.mjs:6`):
  `wallet-operations.ts:518-525`. TTL messages carry **no** node fee.
- Change goes back to the sender as usual. So the sender's own net for a TTL message is
  `−100` (the message amount), which is exactly how the **sender's** copy is later
  re-classified as a message: `mappers.ts:114,121-122,146` test
  `getTxAmount(tx) === MESSAGE_TX_AMOUNT_ATOMIC` (the magic "100" amount is the message
  marker). `SENT_MESSAGE_AMOUNT_SELF_ATOMIC = 100 + 10000` (`config.ts:27`) is the
  non-TTL sent-self total (message + node fee).

> Implication for the SDK: a message tx is built with the normal `buildTransaction`
> selection/ring/sign machinery; the *only* differences are (a) the recipient
> destination amount is forced to `100`, and (b) the `extra` field carries a message
> tag (and optionally a TTL tag). Nothing in `buildTransaction`'s crypto changes.

### 1b. The encrypted message bytes — location and format in `tx_extra`

`tx_extra` is a flat hex byte string of tag-prefixed records. The message record is
appended **after** the tx public-key record (`Cn.ts:2266`, then `:2321-2325`). Layout of
the message record (`Cn.ts:2319-2325`):

```
[ MESSAGE_TAG (1 byte = 0x04) ][ length (1 byte) ][ ciphertext (length bytes) ]
```

- `length` is a **single byte** → ciphertext is capped at 255 bytes
  (`Cn.ts:2297-2304` throws above 255; encoded as `("0"+len.toString(16)).slice(-2)`).
- `ciphertext` = `cipher(key, nonce, frame)` where `frame = UTF-8(body) ++ [0,0,0,0]`
  (4 zero checksum bytes — `Cn.ts:2293-2296`). So the body budget is `255 − 4 = 251`
  bytes (`MAX_MESSAGE_SIZE`, `wallet-network-scalars.mjs:21`, enforced as a **UTF-8 byte**
  count, not char count, at `wallet-operations.ts:498-501`).
- `key` = `cn_fast_hash(generate_key_derivation(recipientSpendPub, txSecret) + "80" + "00")`
  (`Cn.ts:2278-2287`). This is **exactly** the SDK's `deriveMessageKey(otherPub, mySecret)`
  (`messages.ts:57-60`) — sender passes `(recipientSpendPub, txSecretKey)`.
- `nonce` = 12 bytes, big-endian message index; index is **always 0** for a CCX message
  tx ("only have one message", `Cn.ts:2289`), so the nonce is all-zero. This is the SDK's
  `buildNonce(0)` (`messages.ts:62-69`).
- cipher selection: `isKnownSmartMessage(body) ? chacha12 : chacha8` (`Cn.ts:2312-2316`)
  — identical to the SDK's `encryptMessage` (`messages.ts:102`).

> **The encrypted blob the SDK's `encryptMessage(body, key, 0)` already produces IS the
> exact `ciphertext` that goes between the length byte and the next record.** The only
> missing piece is writing `04 ${lenByteHex} ${ciphertextHex}` into `extra`.

### 1c. The message tag / format constants

`tx_extra` tag bytes (`Cn.ts:76-84`, mirrored in `TransactionsExplorer.ts:81-93`):

| tag | hex | meaning |
|---|---|---|
| `TX_EXTRA_TAG_PADDING` | `0x00` | padding (zero-run, no size byte) |
| `TX_EXTRA_TAG_PUBKEY` | `0x01` | 32-byte tx public key `R` (no size byte; fixed 32) |
| `TX_EXTRA_NONCE` | `0x02` | nonce (size byte; sub-tags `0x00` plaintext / `0x01` encrypted payment id) |
| `TX_EXTRA_MERGE_MINING_TAG` | `0x03` | merge-mining (size byte) |
| `TX_EXTRA_MESSAGE_TAG` | `0x04` | **encrypted message** (size byte = ciphertext length) |
| `TX_EXTRA_TTL` | `0x05` | **TTL** (size byte = varint length) |
| `TX_EXTRA_MYSTERIOUS_MINERGATE_TAG` | `0xde` | minergate (size byte) |
| `TX_EXTRA_MESSAGE_CHECKSUM_SIZE` | `4` | trailing zero bytes in the plaintext frame |

> Caveat the SDK should preserve: `0x04` is overloaded — in `Cn.TX_EXTRA_TAGS` it is both
> `ADDITIONAL_PUBKEY` and `MESSAGE_TAG` (`Cn.ts:81-82`). For the message path it is the
> message tag; the additional-pubkey record is written separately
> (`add_additionnal_pub_keys_to_extra`, `Cn.ts:2267-2270`) before the message record.

---

## 2. TTL encoding (where + how)

TTL is a **separate `tx_extra` record**, appended after the message record
(`Cn.ts:2328-2332`):

```
[ TTL_TAG (1 byte = 0x05) ][ size (varint) ][ ttl value (varint) ]
```

- `ttlStr = encode_varint(ttl)`; `size = encode_varint(ttlStr.length / 2)` (byte length of
  the value varint); record = `"05" + size + ttlStr` (`Cn.ts:2329-2331`). Both use lib-js
  `cnutils.encode_varint` (available in the SDK facade — confirmed
  `conceal-lib-js/src/js/cnutils.d.ts:89`).
- The TTL **value is an absolute Unix expiry timestamp in seconds**, NOT a duration. The UI
  computes it as `now_seconds + minutes*60` (`messages/page.tsx:761-764`,
  `messageTtlMinutesToUnix`) and passes it as `ttlUnix` (`message.service.ts:7-10`,
  `wallet-operations.ts:512,546`). A `0` TTL means "no TTL" and the record is omitted
  (`Cn.ts:2328` `if (ttl !== 0)`).
- TTL semantics: a TTL message is a **mempool-only** message that is never mined — it
  expires from the mempool at `ttl` and pays **no fee** (the would-be fee is folded back
  into change: `TransactionsExplorer.ts:1061-1063` `if (ttl > 0) changeAmount += neededFee`;
  the balance check drops the fee term: `Cn.ts:2334-2337`). On the scan side it is
  considered "expired" when `blockHeight === 0 && now >= ttl` (`MessageUI.ts:31-34`).
- Upper bound: `MAX_TTL_MINUTES = cryptonoteMemPoolTxLifetimeSeconds / 60`
  (`config.ts:24`) — the TTL cannot exceed the daemon's mempool lifetime.

Scan-side decode (`TransactionsExplorer.ts:483-490`): read the `0x05` record's data bytes,
hex them, `varintDecode` → `ttl`; attach as `transaction.ttl` (`:779-781`). SDK should add
a `decodeVarint`/reuse a varint reader, or expose lib-js's; wallet-core has a standalone
varint decoder at `lib/wallet-core/Varint.ts` (`decode`) that can be ported verbatim.

---

## 3. What the SDK already covers vs the gaps

### Already covered (in `conceal-wallet-sdk/src/messages.ts`)
- `encryptMessage` / `decryptMessage` — byte-identical cipher, nonce, checksum, ChaCha8/12
  selection, 251-byte UTF-8 cap (`messages.ts:93-140`).
- `deriveMessageKey` — the ECDH spend-key + magic-byte hash (`messages.ts:57-60`).
- `isSmartMessage` / `isKnownSmartMessage` / `encodeSmartMessage` / `parseSmartMessage` /
  `KNOWN_MODULES` (`messages.ts:36-46,142-173`) — the 2FA/vault/to-do/medical/trust/
  contact/agent/status module set matches the wallet (`smart-message.ts:38-47`).

### Gaps (must be added to the SDK)
1. **No `tx_extra` message framing.** `buildTransaction` hardcodes
   `extra: "01" + txPublicKey` (`transactions.ts:587-588`) and offers no hook to append a
   `0x04` message record or `0x05` TTL record.
2. **No TTL support at all** — not in build (no `0x05` record, no fee-into-change
   adjustment, no balance-check relaxation) and not in scan (no `0x05` decode).
3. **No message-bearing tx wrapper** — nothing applies the `100`-atomic recipient
   self-output convention, the "TTL ⇒ no node fee / fee→change" rule, or assembles the
   per-message key from a freshly generated `txSecretKey`.
4. **No scan-time message extraction** — `scanTransactionOutputs` recovers owned outputs
   but never reads/decrypts the `0x04` record or reads the `0x05` TTL, so a received
   message can't be surfaced from a scan (cf. wallet `TransactionsExplorer.ts:765-781`).
   Note the decrypt key uses the **spend secret** (`recepientSecretSpendKey`,
   `TransactionsExplorer.ts:336,348`), so a view-only scan can detect a message tx but
   cannot decrypt its body.
5. **No mark-read state** — `markMessageReadOperation` (`wallet-operations.ts:596-617`)
   flips a per-tx `messageViewed` flag in wallet storage. This is **wallet/runtime state,
   not SDK protocol** — the SDK should NOT own read/unread; it belongs to the consumer's
   storage. Document it as out-of-scope.
6. **Minor: `encodeSmartMessage` action shorthand divergence.** The wallet's
   `smart-message.ts:14-25,65` maps verbose actions to shorthands (`create`→`c`,
   `update`→`u`, …) via `ACTION_MAP`; the SDK's `encodeSmartMessage` (`messages.ts:155-166`)
   does **not**. To stay byte-compatible with conceal-2fa peers, the SDK should either
   port `ACTION_MAP` or document that callers must pass pre-shortened actions. Flag for the
   port decision.

---

## 4. Concrete SDK API to add

Add to `conceal-wallet-sdk/src/transactions.ts` (or a thin `messages`-adjacent module that
composes `buildTransaction`), reusing existing crypto:

### 4a. Extend the extra builder
```ts
// New tag constants (mirror Cn.ts:76-84 / TransactionsExplorer.ts:81-93)
export const TX_EXTRA_TAG_PUBKEY = 0x01;
export const TX_EXTRA_MESSAGE_TAG = 0x04;
export const TX_EXTRA_TTL = 0x05;
export const TX_EXTRA_MESSAGE_CHECKSUM_SIZE = 4;

/** Append a 0x04 message record: "04" + 1-byte len + ciphertext (≤255 bytes). */
function encodeMessageExtra(ciphertextHex: Hex): Hex;        // throws if >255 bytes
/** Append a 0x05 TTL record: "05" + varint(size) + varint(ttlUnixSeconds). */
function encodeTtlExtra(ttlUnixSeconds: number): Hex;        // uses cnutils.encode_varint
```
`buildTransaction` gains an optional `extraRecords?: Hex` (or `message?` / `ttl?`) appended
to the current `"01"+R` so the message/TTL records land *after* the pubkey record
(matching `Cn.ts:2266→2321→2328` ordering).

### 4b. `buildMessageTransaction`
```ts
export interface BuildMessageTransactionInput {
  keys: WalletKeys;
  recipient: { spendPublicKey: Hex; viewPublicKey: Hex };
  body: string;                       // ≤251 UTF-8 bytes (validated)
  changeKeys: { spendPublicKey: Hex; viewPublicKey: Hex };
  unspentOutputs: SpendableOutput[];
  decoys: DecoySet[];
  fee: number;
  mixin: number;
  ttlUnixSeconds?: number;            // 0/undefined = none (absolute expiry, not duration)
  nodeFee?: { spendPublicKey; viewPublicKey; amount } | null; // omit when ttl > 0
  messageAmount?: number;             // default MESSAGE_TX_AMOUNT_ATOMIC = 100
}
export function buildMessageTransaction(input): BuiltTransaction;
```
Behavior: derive `key = deriveMessageKey(recipient.spendPublicKey, builtTx.txSecretKey)` →
`encryptMessage(body, key, 0)` → `encodeMessageExtra(...)`; recipient destination amount =
`100`; append node-fee destination only when `ttl` is 0; when `ttl > 0`, fold the fee into
change and relax the balance check (port `Cn.ts:2334-2337` / `TransactionsExplorer.ts:1061-1063`).
Reuse `buildTransaction`'s selection/ring/sign path; only inject the extra records and the
amount/fee rules.

### 4c. Scan-time message extraction
```ts
export interface ScannedMessage {
  ciphertextHex: Hex;          // raw 0x04 record payload
  ttlUnixSeconds: number;      // 0 when no 0x05 record
}
/** Parse 0x04 message + 0x05 TTL records out of a tx extra hex. */
export function extractMessageFromExtra(extraHex: Hex): ScannedMessage | null;

/** Convenience: scan + decrypt in one call (spend secret required to decrypt body). */
export function readMessageFromTransaction(
  tx: RawTransaction, keys: WalletKeys,
): { body: string | null; ttlUnixSeconds: number; owned: OwnedOutput[] } | null;
```
`extractMessageFromExtra` walks the extra exactly like `parseExtra` (`TransactionsExplorer.ts:129-179`):
read tag, then for `0x04`/`0x05` read the size byte and slice the payload; decode TTL with a
ported varint reader (`lib/wallet-core/Varint.ts`). `readMessageFromTransaction` derives the
key from the tx pubkey + the recipient spend secret
(`deriveMessageKey(txPubKey, keys.spend.sec)`) and calls `decryptMessage(..., 0)`. This
gives the SDK a "listMessages-from-scan" primitive: scan a batch of raw txs, keep the ones
that own a `100`-atomic output and/or carry a `0x04` record, decrypt, and return bodies +
TTL. (Sender-side re-classification by the `100` amount and read/unread state stay with the
consumer — see gap 5.)

### 4d. TTL helper (parity with the UI)
```ts
/** now + minutes*60 in Unix seconds; 0 for null/≤0 (mirrors messageTtlMinutesToUnix). */
export function ttlMinutesToUnix(minutes: number | null): number;
```

---

## 5. The extra-field tag constants (copy-ready)

```ts
// tx_extra record tags — hex byte values (Cn.ts:76-84, TransactionsExplorer.ts:81-93)
export const TX_EXTRA_TAG_PADDING            = 0x00; // padding (zero-run)
export const TX_EXTRA_TAG_PUBKEY             = 0x01; // 32-byte tx public key R (no size byte)
export const TX_EXTRA_NONCE                  = 0x02; // nonce record (has size byte)
export const TX_EXTRA_MERGE_MINING_TAG       = 0x03;
export const TX_EXTRA_MESSAGE_TAG            = 0x04; // encrypted message (size byte = ciphertext len)
export const TX_EXTRA_TTL                    = 0x05; // TTL (size byte = varint length)
export const TX_EXTRA_MYSTERIOUS_MINERGATE_TAG = 0xde;

// nonce sub-tags (first byte of a 0x02 record's data)
export const TX_EXTRA_NONCE_PAYMENT_ID           = 0x00;
export const TX_EXTRA_NONCE_ENCRYPTED_PAYMENT_ID = 0x01;

// framing sizes / amounts
export const TX_EXTRA_MESSAGE_CHECKSUM_SIZE = 4;     // trailing zero bytes in plaintext frame
export const MAX_CIPHERTEXT_BYTES           = 255;   // single-byte length field cap
export const MAX_MESSAGE_BODY_BYTES         = 251;   // 255 − 4 (UTF-8 bytes, MAX_MESSAGE_SIZE)
export const MESSAGE_TX_AMOUNT_ATOMIC       = 100;   // recipient self-output marker amount
export const REMOTE_NODE_FEE_ATOMIC         = 10000; // node fee (omitted when ttl > 0)
```
(`MESSAGE_TX_AMOUNT_ATOMIC`, `REMOTE_NODE_FEE_ATOMIC`, `MAX_MESSAGE_SIZE`, `MAX_TTL_MINUTES`
are network scalars in `lib/config/wallet-network-scalars.mjs:6,9,21` /
`lib/config/config.ts:15,23,24,25,27` — port them as SDK constants or accept them as params.)
