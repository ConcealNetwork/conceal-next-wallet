# 003 — When a session intent is created

Status: **Accepted.**  
Date: 2026-11-18

## Context

A session intent is the rebuild input for one spend that did not land: recipient, amount, term, message body, or "fuse". It lives in RAM on the unlocked runtime. It is not a stored transaction, not signed hex, and not the SDK outbound queue. Lock, switch, or reload drops every row.

Each caller maps pipeline failures onto `enqueueAuto` / `enqueueHung`. Send, create-deposit, withdraw, optimize, and message use the same map.

## Decision

An intent is created only after the user has confirmed a spend on a synced wallet and the wallet cannot honestly say the daemon accepted it. Two rows exist.

**No intent while syncing.** The action that creates the spend is disabled while the wallet is syncing: the Send review button, the deposit Create and Review buttons, Optimize, every message Send (compose and reply — compose has no separate confirm step, and `?new=1` opens it directly), and Pulse broadcast. A confirm dialog that was opened on a synced wallet is not re-gated, same as send.

**Auto.** No transaction hash exists yet, or the daemon answered and refused. The payload is enough to build a fresh transaction later. Cause is `decoy` (the node was not reached: offline tab, height, fee address, or decoys) or `submit` (the node answered with a reject). After two synced ticks the drain rebuilds it. Five decoy failures or three submit failures drop it and toast `queueCopy.exhaustToast`. A rebuild that finds the funds gone, the deposit locked or missing, the message TTL expired, or nothing left to fuse drops the row with no toast.

**Hung.** A hash exists and the submit call's error text contains `timed out`. The row stores every hash that submit produced and does not auto-rebuild. It is marked sent when any of those hashes is known to the node: mined, seen in the pool, or relay-accepted by this wallet (a pending hold). Submit builds again only when none of them is. A height or connect error whose text contains `timed out` is still **auto**, because no hash exists and nothing was broadcast.

These calls throw and store nothing:

- view-only
- invalid address, amount, term, or message
- not enough unlocked balance on the first try
- deposit still locked, already pending, or gone
- input selection throws
- optimize finds nothing to fuse

A relay accept stores a pending record and no intent. Nothing after the accept calls the node. If the local save after an accept is slow enough to pass the window, a hung row is still parked, but its hash already has a pending hold, so it is marked sent and Submit never builds it again. A relay OK that arrives after the window closed still writes the pending hold and the tx key while the wallet is unlocked.

## Caller map

| Confirmed action | 10s hang before a hash | Tab offline | Node not reached before a hash | Decoy fetch fails | Submit error contains `timed out` | Relay reject or other submit error |
| --- | --- | --- | --- | --- | --- | --- |
| Send | auto, or hung if a hash already exists | auto `decoy` | auto `decoy` (fee address is not swallowed) | auto `decoy` | hung | auto `submit` |
| Create deposit | same as send | auto `decoy` | auto `decoy` (fee address is not swallowed) | auto `decoy` | hung | auto `submit` |
| Withdraw | same as send | auto `decoy` | auto `decoy`, including a height error that says `timed out` | auto `decoy` | hung | auto `submit` |
| Optimize | same as send | auto `decoy` | auto `decoy`, including a height error that says `timed out` | auto `decoy` | hung | auto `decoy` or `submit` |
| Message | same as send | auto `decoy` | auto `decoy` (fee address is not swallowed) | auto `decoy` | hung | auto `submit` |

Every caller closes the door after 10 seconds (`connectHangMs`) plus a 3 second grace if the link is still up (`lateGraceMs`). A late RPC cannot also submit.

`feeaddress` and `getrandom_outs` failing in the console are decoy failures. Firefox reports a dead connection as `CORS request did not succeed` with status `null`. That is not a daemon CORS rejection, and it is not a hung intent.

## After the row exists

The drain does not run while the wallet is still syncing. An auto row waits two successful syncs, then rebuilds through the same pipeline. A sync started by that rebuild must not start a second rebuild of the same row. Each row is re-read before its rebuild, so a row cancelled during the pass is skipped. Success or a silent drop removes the row. The card polls; "Retrying" on an auto row means the row is still saved, not that a broadcast is in flight.

The confirm dialog closes when the attempt finishes, including when the result is only an intent. The thread or transaction detail stays closed until a relay accept.

A saved withdraw row (auto, or hung and not yet marked sent) counts as a pending withdrawal: its deposit shows "Withdrawing", the Withdraw button is disabled, and a second withdraw for it is refused. A saved fusion row does the same for Optimize. When the card's poll sees a row leave or change state, the wallet, transactions, deposits and optimize status are refreshed.

## Consequence

Every confirmed spend follows the send row. The deposit-constraints display still reads the fee address through `safeNodeFeeAddress`, which swallows errors; that is display only and never creates an intent.
