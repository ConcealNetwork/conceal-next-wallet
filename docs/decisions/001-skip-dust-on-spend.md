# 001 — Skip dust when selecting ordinary spend inputs

Status: **Accepted**  
Date: 2026-08-01

## Context

The account UI already treats outs below `DUST_THRESHOLD` (10 atomic) as
**Dust** and excludes them from **Available**. The SDK's `selectInputs` accepts
a `dustThreshold` argument but defaults it to `0`. Our send / deposit / message
paths called `selectInputs(outputs, target)` without that argument, so pretty
dust (e.g. amount `6`) could still be chosen as inputs even though Available
said those funds were not spendable that way.

Pretty dust is mixable (see `docs/protocol/outputs-dust-and-pretty.md`). The
bug was policy mismatch (UI vs builder), not decoy failure. A mainnet send was
observed with an amount-`6` input — valid rings, wrong product behaviour.

Conceal Desktop already skips those outs (`WalletGreen::selectTransfers` /
legacy `selectTransfersToSend`: `amount > defaultDustThreshold()`). Legacy
conceal-web-wallet does not.

## Decision

1. Add `selectSpendInputs(outputs, target)` in `lib/services/real-sdk/spend.ts`
   that calls `txns.selectInputs(outputs, target, DUST_THRESHOLD)`.
2. Route **send**, **deposit create**, and **message** through that helper.
3. Leave `selectableOutputs` as **pretty-only** (no dust strip) so Optimize /
   fusion can still draw pretty dust into fusion buckets.

## Consequences

- Ordinary spends align with Available and with Desktop.
- Mixable dust stays on the wallet until fusion consolidates it (or the user
  somehow spends via another client that does not gate dust).
- Call sites must not invoke bare `selectInputs` for user spends without an
  explicit dust threshold; fusion keeps using the wider pretty pool.

## Alternatives considered

- **Filter dust inside `selectableOutputs`.** Rejected: that pool feeds fusion;
  stripping dust would hide the outs Optimize is meant to sweep.
- **Change the SDK default `dustThreshold` to `DUST_THRESHOLD`.** Optional
  upstream hardening for other consumers; not required once this wallet passes
  the threshold explicitly.
- **Match web-wallet (no dust gate).** Rejected: weaker than Desktop and
  contradicts the Available / Dust split already shown in the UI.
