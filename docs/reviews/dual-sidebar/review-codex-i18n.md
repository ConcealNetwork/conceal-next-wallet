Finding:
- components/layout/rails/transactions-rail.tsx:171 + lib/i18n/dictionaries.ts:70: copy-button aria labels changed in English from `Copy ${label.toLowerCase()}` to `Copy {label}`. For `Payment ID` / `Tx hash`, this now renders `Copy Payment ID` / `Copy Tx hash` instead of `Copy payment id` / `Copy tx hash`, changing exact accessible names. Fix: preserve the old lowercasing before interpolation, e.g. pass `label.toLowerCase()` for this English-compatible field label path or use a dedicated lowercased copy label.

Clean checks:
- Placeholder parity: all locales keep the exact `{label}`, `{pct}`, `{amt}`, and existing `{name}` tokens for the keys that have placeholders.
- Key parity: en, es, fr, de, it, pt, ru, zh, ja, ko have identical dictionary key sets.
- Required English names preserved: `Quick actions`, `Send CCX`, `Collapse panel`, `Back to list`, `No transaction selected`, `Open notifications`, `Synced`.
- Reused rail nav keys are correct in English: `nav.account=Account`, `nav.market=Market`, `nav.send=Send`, `nav.receive=Receive`.
