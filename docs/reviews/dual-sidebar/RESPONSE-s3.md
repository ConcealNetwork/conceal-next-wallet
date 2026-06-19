# #122 stage 3 — review response

Pre-PR multi-agent review of the contextual Transactions detail rail. Reviewers:
CodeRabbit (CLI), Codex (gpt-5.5), GLM-5.2.

## Codex (gpt-5.5)

| # | Finding | Verdict |
|---|---------|---------|
| 1 | At >=1200px with the rail **collapsed** to its strip, selecting a row suppressed the dialog (`railVisible` true) but the rail node isn't rendered (the strip is) → the detail showed **nowhere** (HIGH) | **Fixed.** Gate the dialog on `detailInRail = railVisible && !railCollapsed` instead of width alone — when the rail is collapsed (or narrow) the detail falls back to the dialog. Exposed `useRightRailCollapse` for the page; added an e2e ("…falls back to the dialog when the rail is collapsed"). |

Codex confirmed clean: the `usePageRightRail` deps re-registration (no loop; selection is discrete; nodeRef stops JSX identity becoming a dep; cleanup clears on unmount/dep change), the transaction-display extraction preserves all label/icon/sign/status/timestamp/height logic (incl. outgoing-message sign), the dialog still renders the full detail below the breakpoint, `useMediaQuery` SSR/static-export safety, and accessibility (keyboard-reachable Back button, labelled copy buttons).

## CodeRabbit

`coderabbit review --plain -t all --base main` → **No findings.**

## GLM-5.2

`timeout 900 opencode run -m zai/glm-5.2` → no output (the known opencode
review-size hang, as in stage 2). No findings produced; advisory reviewer.
