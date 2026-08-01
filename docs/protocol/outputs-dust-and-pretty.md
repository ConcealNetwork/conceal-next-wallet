# Outputs: pretty denominations, dust, and unmixable leftovers

Conceal is a CryptoNote-family chain that still uses **amount-matched ring
signatures** (not amount-hiding RingCT). Every spendable key output has a public
`amount`. Decoys for an input must share that exact amount, so wallet software
treats denomination shape as a privacy property — not just an accounting detail.

This note defines three related ideas that are easy to conflate: **pretty
amounts**, **dust**, and **unmixable leftovers**. They overlap in the UI word
"dust" but they are not the same filter.

---

## How change creates small outputs

A send rarely consumes inputs whose sum equals `payment + fee` exactly. The
wallet therefore creates **change** back to the sender.

Because rings are keyed by amount, change (and most other destinations) is
broken into standard denominations of the form `{1..9} × 10^k` atomic units —
the **pretty ladder** (`PRETTY_AMOUNTS` in the SDK / currency config). Examples
in atomic units: `1`, `6`, `10`, `50`, `100`, `800000`, `1000000` (1 CCX).

That decomposition keeps most change outs mixable: many other wallets produce
the same bill sizes, so the daemon can supply decoys for each amount.

Arithmetic on inputs, fees, and historical non-ladder outs can still leave a
remainder that is **not** on the ladder (for example an odd withdraw redeem).
Those leftovers are the privacy problem below — separate from "tiny but pretty."

---

## Pretty amounts (mixable denominations)

| Rule | Meaning |
|---|---|
| Form | Exact member of `{1..9} × 10^k` |
| Privacy | Peers of the same amount usually exist on-chain |
| Spend policy (this wallet) | Ordinary spends only select pretty outs |

Non-pretty amounts are treated as **unmixable** for selection: using them as
inputs would request decoys for a singleton (or near-singleton) amount set and
weaken or break ring anonymity. This wallet filters them out of the ordinary
spend pool (`selectableOutputs` / pretty check). Fusion/optimize also requires
pretty amounts inside a denomination bucket.

---

## Dust (wallet threshold, not "unmixable")

| Rule | Meaning |
|---|---|
| Threshold | `DUST_THRESHOLD` = **10** atomic (`0.000010` CCX) |
| Definition | Unspent key output with `0 < amount < 10` |
| Ladder? | Usually **yes** — `1..9` are pretty |
| Mixable? | **Yes** when pretty — decoys for amount `6` exist |

Dust is a **wallet policy / UX** bucket: outs too small to bother spending in a
normal transfer, shown separately from Available, and left for fusion to
consolidate. It is **not** "empty decoy set."

A live example of mixable dust: amount `6` can appear both as an input and as
change in the same transaction; rings for that amount succeed with the usual
mixin.

### Why dust persists

1. **Change still decomposes to the bottom of the ladder.** Pretty splitting
   produces `1..9` atomic outs whenever the remainder needs those digits.
2. **Consensus does not forbid tiny outs.** Nodes accept them; wallets decide
   whether to select them.
3. **Ordinary spends prefer larger bills.** Tiny outs accumulate until Optimize
   / fusion merges many same-power-of-ten outs into fewer larger ones.

---

## Unmixable leftovers (true privacy dust)

| Rule | Meaning |
|---|---|
| Form | Amount **not** on the pretty ladder |
| Privacy | Few or no same-amount peers → weak or impossible rings |
| Spend policy (this wallet) | Never selected for ordinary spends |

These are the outs that historically earned the "spend only in the clear /
must fuse" reputation. On Conceal they are uncommon once wallets decompose
strictly to pretty amounts, but they can still appear from older paths or odd
redeem/change shapes. They must not be confused with pretty `1..9` dust.

---

## Quick comparison

| Kind | Example (atomic) | Pretty? | Typical decoys? | In Available? | Selected on send? | Fusion target? |
|---|---|---|---|---|---|---|
| Normal pretty | `1000000` | Yes | Yes | Yes | Yes | If below fusion threshold |
| Pretty dust | `6` | Yes | Yes | No (dust bucket) | No (`selectSpendInputs`) | Yes (still in selectable pool) |
| Unmixable leftover | `7016906` | No | No / scarce | Counted in totals; not spendable via normal path | No | No (not pretty) |

---

## Related wallet behaviour

- **Available** = spendable unspent − dust (`getDustAmount` / Desktop
  `getActualBalance − getDustBalance`).
- **Send / deposit / message** use `selectSpendInputs` → SDK `selectInputs` with
  `DUST_THRESHOLD` (pretty **and** `amount > 10`).
- **Optimize** keeps pretty dust in `selectableOutputs` so fusion can sweep it.
- **Conceal Desktop** filters spend inputs with `amount > defaultDustThreshold()`.
- **Legacy conceal-web-wallet** did **not** apply that dust gate on send (it
  could pick amount `6`); this wallet follows Desktop.

See also: `docs/decisions/001-skip-dust-on-spend.md`,
`docs/specs/sdk-engine-migration/gaps/fusion.md`.
