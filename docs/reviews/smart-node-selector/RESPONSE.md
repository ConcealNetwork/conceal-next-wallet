# #174 smart node selector — review response

Reviewers (read-only): **CodeRabbit · Codex CLI · GLM-5.2 · Gemini 3.1 Pro**. CodeRabbit: no findings. Strong convergence on a few correctness/UX items (none fund-path — the selector only changes the home node URL via the existing `applyNodeConnection` switch).

| Sev | Source(s) | Finding | Resolution |
|-----|-----------|---------|------------|
| MEDIUM | GLM, Codex | **"Use" enabled for an unreachable node** → switches + fires a misleading success toast (the apply path only validates URL format; `checkCustomNodeLag` returns null for a dead node). | Disable per-node "Use" when the latest probe is `reachable === false`. |
| MEDIUM | Codex | **"Use fastest" ranked stale cached probes** — a node that fell behind/failed since the last probe could be picked. | "Use fastest" now RE-PROBES on click and ranks the fresh result (`runProbe` returns its results). |
| MEDIUM | Gemini, GLM, Codex | **Concurrent-probe race** — a pool change mid-probe lets an older request overwrite fresh results / clear the spinner early. | Generation nonce in `runProbe`; only the latest generation commits state, plus a defensive `catch`. |
| LOW | Gemini, GLM | **`bestHeight` via `Math.max`** — one node reporting an inflated tip flips every honest node to "stale" and empties the list. | Reference height = **second-highest** for 3+ nodes (discards a single inflated outlier), max for ≤2 (preserves correct stale-exclusion). |
| LOW | Gemini | **"Use fastest" clickable before the first probe** → erroneous "none reachable" toast. | Subsumed by re-probe-on-click: the click probes first, so it never acts on an empty cache. |
| LOW | GLM | **Card flashes out on node switch** — `useSmartNodes` re-keys on `activeNodeUrl`, so `data` is briefly undefined and the card unmounts. | `placeholderData: (previous) => previous` on the query — keeps the list across the switch. |
| INFO | GLM | Stale `useSmartNodes` comment ("Network page only" — Settings consumes it now). | Comment updated. |
| INFO | GLM | Probe-contract test gap. | Added `probeNode` tests (live + never-throws) and a bogus-high-node ranking test. |

## Confirmed clean (all reviewers)

`rankNodes` cannot pick an unreachable/stale node; `fastestNodeUrl([]) → null` handled at the call site; the `urlsKey`-ref `useEffect` neither loops nor misses a membership change (Strict-Mode-safe); probes are credential-less GETs to curated-pool URLs only (no secrets); i18n parity holds (11 keys × 10 locales); the card is gated `!isMock` so no probe/network activity leaks into mock mode.
