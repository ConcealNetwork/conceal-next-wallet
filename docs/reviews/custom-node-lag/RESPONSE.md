# Custom-node lag check — review notes

Feature: when a user sets/updates a **custom** daemon node, the app probes the public reference daemons and shows a non-fatal `toast.warning` if the custom node's tip is well behind the network (a stale node shows outdated height/balances). Implements the #21 "Custom-node lag check" item.

## Design

- **Reference = consensus proxy.** `NodeStatus.networkHeight` is the *active node's own* reported tip, so it can't reveal that node being behind. Instead the check probes the public `DEFAULT_DAEMON_NODES` (extracted in `lib/config/config.ts`) and compares the custom node's tip to the highest reachable reference. SSL-cert inspection is out of scope (browser fetch can't do it), per the backlog.
- **Hook point.** Runs after the existing reachability probe, in `applyNodeConnection`'s `onSuccess`, gated to `input.useCustomNode && !isMock` — only real custom-node changes, on a user action.
- **Never blocks, never throws.** `checkCustomNodeLag` probes node + references via `Promise.allSettled` and returns `null` ("no warning") when it can't judge (custom node is itself a reference, custom node unreachable — surfaced elsewhere, or no reference reachable). The fire-and-forget call also has a `.catch` as belt-and-suspenders.
- **Threshold = 5 blocks** (`NODE_LAG_WARN_BLOCKS`) — absorbs the 0–1 block propagation/timing skew between the near-simultaneous probes while still catching a genuinely stale node (~10 min at 120s/block).

## Review

- **Antigravity (Gemini 3.1 Pro)** — clean. Explicitly confirmed `checkCustomNodeLag` cannot reject (async wrappers caught by `allSettled`), the 5-block threshold safely absorbs propagation skew, and a sameHost dedupe miss (e.g. `www.`) harmlessly yields a zero-lag self-comparison.
- **CodeRabbit** — no findings.
- **GLM-5.2** — third-opinion pass; any finding noted before merge.
- **Codex** — out of credits this run.

## Verification

`npm run types && npm run lint && npm test` (263 unit, +8 `node-lag`) green; `NEXT_PUBLIC_USE_MOCK=false npm run build` clean (generated `public/config.js` node list unchanged by the `DEFAULT_DAEMON_NODES` extraction); `e2e/golden-path` passes.
