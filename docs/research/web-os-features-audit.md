# Web / Browser / OS Platform API Audit — Conceal Next Wallet PWA

> **Scope.** Inventory of which Web/Browser/OS platform APIs this self-custody
> CCX wallet PWA *uses today* vs. *could adopt*, with a deliberate focus on
> **push / notifications**. Assessed against this project's three hard
> constraints: **static export (`output: "export"`), no backend/server, must
> stay non-custodial.**
>
> API support/status verified against current sources (June 2026) — MDN
> Baseline labels, the WebKit iOS Web Push announcement, and caniuse — not
> memory. Each row cites its source. Code locations are absolute paths.
>
> **Headline answer (push/notifications):** Real *server push* is **impossible
> without a backend** — Push API mandates an application server (VAPID) that
> POSTs to a push service. What a backend-less static PWA *can* do — and this
> wallet **already does** — is **local, opt-in OS notifications** via the
> Notification API (`registration.showNotification` with a constructor
> fallback), fired from the foreground for due reminders / overdue check-ins.
> That is the realistic ceiling here.

---

## TL;DR priority table

| Priority | API | State here |
|---|---|---|
| **Already used — keep** | Web Crypto, WebAuthn-PRF passkeys, Service Worker (offline cache), Notifications (local/opt-in), Web Share + file share, Clipboard, Protocol Handlers (`web+conceal`), Manifest shortcuts, `beforeinstallprompt` install hook | Shipped |
| **Available + worth adopting** | Badging API (unread/overdue badge), Screen Wake Lock (long first sync) | Recommended, low-risk |
| **Worth it, but Chromium/Android-only — gate carefully** | Web Share **Target** (receive shared `web+conceal:` URIs), Web NFC (tap-to-share address) | Nice-to-have, progressive enhancement |
| **Requires a backend — out of scope** | Push API (server push), and therefore background notifications when the app is fully closed | Not feasible non-custodially without server infra |
| **Not worth it for a wallet** | Periodic Background Sync, Idle Detection, Contact Picker, Vibration | Skip / low value vs. cost |

---

## PART 1 — Currently USED (verified in the codebase)

### Web Crypto API (`crypto.subtle`, `crypto.getRandomValues`) — USED, critical
- **Where:** `/Users/travis/Projects/conceal-next-wallet/lib/auth/webauthn-crypto.ts`
  (AES-GCM wrap of the wallet password with the PRF secret),
  `/Users/travis/Projects/conceal-next-wallet/lib/storage/vault-crypto.ts`
  (PBKDF2 `deriveKey` + AES-GCM vault encryption),
  `/Users/travis/Projects/conceal-next-wallet/lib/auth/webauthn-prf.ts`
  (random challenges/ids). concealjs also uses `window.crypto.getRandomValues`.
- **Verdict:** Essential and correct. Baseline / universally available in
  secure contexts. No change needed.

### WebAuthn / Passkeys (`navigator.credentials`, PRF extension) — USED, flagship
- **Where:** `/Users/travis/Projects/conceal-next-wallet/lib/auth/webauthn-prf.ts`
  (multi-authenticator biometric unlock via the WebAuthn **PRF** extension —
  platform Touch ID/Face ID/Windows Hello, roaming keys),
  `webauthn-crypto.ts`, `biometric-store.ts` (per-wallet-id enrollments).
- **Caveat:** PRF support is good on current Chromium + Safari/iOS 18+ but not
  universal on older authenticators; the code already feature-detects and
  treats biometric unlock as additive (password remains the fallback).
- **Verdict:** Best-in-class for a non-custodial wallet — the secret never
  leaves the device. Keep.

### Service Worker — USED (offline app-shell cache only; **no push listener**)
- **Where:** `/Users/travis/Projects/conceal-next-wallet/public/service-worker.js`
  (network-first navigations, cache-first vendored `/lib` + `/workers`, atomic
  precache), registered in
  `/Users/travis/Projects/conceal-next-wallet/components/wallet/wallet-service-worker.tsx`
  (real-mode only, base-path-aware). Precache list built by
  `/Users/travis/Projects/conceal-next-wallet/lib/pwa/precache.mjs`.
- **Note:** No `push` or `notificationclick` handler — correct, since there is
  no push backend. `notify()` *does* prefer `registration.showNotification()`
  so notifications survive a backgrounded tab.
- **Verdict:** Good. (One adoptable hook lives here: `notificationclick` to
  focus the wallet when a local notification is tapped — see Part 2.)

### Notifications API (local, opt-in) — USED — **this is the push story**
- **Where:** `/Users/travis/Projects/conceal-next-wallet/lib/notifications/notify.ts`
  — `isNotificationSupported`, `getPermission`, opt-in flag in `localStorage`
  (`ccx-notifications-opt-in`), `requestNotificationPermission` (user-gesture,
  normalizes Safari's callback form), `canNotify` (opted-in **AND** granted),
  and `notify()` which prefers `registration.showNotification()` then falls
  back to `new Notification()`. Consumed by
  `/Users/travis/Projects/conceal-next-wallet/lib/hooks/use-due-reminders.ts`
  (scheduled-payment due reminders) and `.../lib/hooks/use-check-ins.ts`
  (overdue check-ins), both fired on wallet open + on `visibilitychange`,
  de-duped per due-instance. Settings toggle in
  `/Users/travis/Projects/conceal-next-wallet/app/(wallet)/wallet/settings/page.tsx`
  (`NotificationsSetting`).
- **Status (verified):** MDN labels the Notifications API **"Limited
  availability"** (not Baseline) — because notification behavior varies and,
  on iOS, plain web-page notifications are gated. The constructor form is
  deprecated in workers; this code's SW-first path is the modern choice.
  [MDN Notifications API]
- **iOS caveat (verified):** On iOS/iPadOS, notification permission +
  delivery require the app to be **added to the Home Screen** (installed,
  standalone) — Safari 16.1 (macOS) / iOS 16.4 added Web Push for installed
  web apps, and *permission may only be requested from a user gesture*.
  A non-installed iOS Safari tab cannot show these. [WebKit iOS Web Push blog]
- **Verdict:** This is exactly the right, and only, server-free notification
  strategy. **Keep as-is.** It is *local* — fired by the running app, not
  pushed. The honest limitation: it cannot fire when the app/tab is fully
  closed (that needs Push — see Part 3).

### Web Share API + file sharing (`navigator.share`, `navigator.canShare`) — USED
- **Where:** `/Users/travis/Projects/conceal-next-wallet/components/wallet/share-payment-card.tsx`
  — feature-detects `navigator.share`, shares the rendered payment-card **PNG**
  via `canShare({ files })`, else falls back to text share, with a Save-to-file
  fallback when `navigator.share` is absent. `AbortError` (user cancel)
  correctly swallowed.
- **Status (verified):** MDN "Limited availability"; caniuse ~91% global
  (full on mobile Safari/Chrome Android; desktop Firefox lacks it; desktop
  Chrome behind a flag historically). Secure-context only; must be called from
  a user gesture; not available in workers. [MDN Web Share API], [caniuse web-share]
- **Verdict:** Correctly implemented with fallbacks. Keep.

### Clipboard API (`navigator.clipboard.writeText`) — USED
- **Where:** `/Users/travis/Projects/conceal-next-wallet/components/wallet/common.tsx`
  (copy address/value), `/Users/travis/Projects/conceal-next-wallet/app/(onboarding)/create/page.tsx`
  (copy mnemonic, with toast on failure).
- **Verdict:** Standard, secure-context, broadly supported. Keep. (Security
  note: copying a seed phrase to the clipboard is inherent to the UX but is a
  known exfiltration surface — the existing toast + manual action is the right
  posture; no API change warranted.)

### Protocol Handlers (`web+conceal:`) — USED (manifest)
- **Where:** `/Users/travis/Projects/conceal-next-wallet/app/manifest.ts`
  — `protocol_handlers: [{ protocol: "web+conceal", url: "./wallet/send?uri=%s" }]`.
  Decoder in `/Users/travis/Projects/conceal-next-wallet/lib/ui/coin-uri.ts`.
  **Confirmed: the manifest registers it.**
- **Status (verified):** MDN "Limited availability" + **Experimental** —
  Chromium/installed-PWA on desktop primarily; Firefox/Safari do **not** honor
  manifest `protocol_handlers`. Only `web+`-prefixed (or a fixed safelist)
  schemes are allowed. [MDN protocol_handlers]
- **Verdict:** Correct and worth keeping as progressive enhancement; just don't
  rely on it cross-browser. (`registerProtocolHandler()` is an alternative but
  has the same limited reach and needs a user gesture.)

### Manifest shortcuts + install affordance — USED
- **Where:** `app/manifest.ts` (`shortcuts`: Send/Receive/Deposits/Address
  Book). `beforeinstallprompt` handled in
  `/Users/travis/Projects/conceal-next-wallet/lib/hooks/use-install-prompt.ts`
  — captures the Chromium event for a custom install button, detects standalone
  via `matchMedia("(display-mode: standalone)")` and iOS `navigator.standalone`,
  and **already hints the manual "Share -> Add to Home Screen" flow on iOS**
  (which has no `beforeinstallprompt`).
- **Status (verified):** `beforeinstallprompt` is **non-standard, Chromium-only**;
  MDN explicitly warns it is non-standard. iOS = manual install. [MDN Trigger install prompt]
- **Verdict:** Already handled exactly as the spec landscape demands. Keep.

---

## PART 2 — AVAILABLE and RECOMMENDED (not yet used, feasible under our constraints)

### Badging API (`navigator.setAppBadge` / `clearAppBadge`) — RECOMMEND
- **What:** Numeric/dot badge on the installed app icon — natural fit for the
  existing **overdue check-ins** and **due reminders** counts (the sidebar
  already computes `useOverdueCheckInCount`).
- **Status (verified):** MDN **"Limited availability"** — works on installed
  PWAs in Chromium (desktop + Android) and Safari/iOS for Home-Screen web apps;
  not in Firefox. Document-scope `setAppBadge` works without a service worker,
  so it fits a static export. [MDN Badging API]
- **Feasibility:** High. Pure client call, no backend, no engine import — set
  it from the same hooks that already compute the counts; clear on view. Lives
  cleanly in the existing "purely-local UI metadata" lane.
- **Caveat:** Only visible when **installed**; silently no-ops otherwise
  (feature-detect, never throw). Recommend wiring it into
  `use-check-ins.ts` / `use-due-reminders.ts`.

### Screen Wake Lock API (`navigator.wakeLock.request("screen")`) — RECOMMEND (scoped)
- **What:** Keep the screen awake during the **initial long blockchain sync**
  so the device doesn't sleep mid-scan while the user watches the progress.
- **Status (verified):** **Baseline 2025 (newly available)** since March 2025 —
  current Chromium, Safari, Firefox. Secure-context; lock auto-releases on tab
  hide, so re-acquire on `visibilitychange` (MDN documents the exact pattern).
  [MDN Screen Wake Lock API]
- **Feasibility:** High, but **scope it tightly** — request only while a
  full/large sync is actively running and the sync screen is foreground;
  release the moment it completes or the tab hides. Battery-respectful.
- **Verdict:** Worth a small, gated addition tied to the sync-progress UI.

---

## PART 3 — REQUIRES A BACKEND (out of scope while non-custodial + serverless)

### Push API (`PushManager.subscribe`, `pushsubscriptionchange`) — NOT FEASIBLE HERE
- **What real push needs (verified):** Push API delivers messages **even when
  the app is closed**, but it is inherently a *three-party* system:
  (1) the app subscribes via the browser's **push service** and gets a
  `PushSubscription` endpoint; (2) **your application server** stores that
  subscription and, using **VAPID** keys + the Web Push protocol (e.g. the
  `web-push` library), **POSTs an encrypted payload to the push service**;
  (3) the push service wakes the service worker's `push` event.
  [MDN Push API; Next.js PWA guide shows the required `'use server'`
  `webpush.setVapidDetails(...)` + `webpush.sendNotification(...)` server
  action — i.e. a server is mandatory.]
- **Why it's out of scope here:**
  - **No backend / static export** — there is no server to hold subscriptions
    or sign+send VAPID payloads. Push *cannot* be done from the browser alone.
  - **Non-custodial** — to push "you received CCX" the server would have to
    learn the user's address / scan the chain for them, which is a privacy and
    custody regression. Any push server becomes a tracking party.
  - **iOS** additionally requires the app to be installed to Home Screen even
    if a server existed. [WebKit iOS Web Push blog]
- **What *is* achievable without a server (already done):** **local**
  notifications fired by the running app for due reminders / overdue check-ins
  (Part 1). The unavoidable gap vs. real push: nothing fires while the app is
  fully closed.
- **If a backend is ever added (explicitly noted, not recommended now):** the
  *least-custodial* shape would be a stateless relay that the **user opts into**
  and that only ever holds an opaque `PushSubscription` + user-chosen reminder
  schedules (never keys, never the wallet address, never chain-scanning). That
  is real server infrastructure (VAPID key management, a subscription store,
  a scheduler) and a deliberate trust trade-off — flag it, don't build it under
  the current constraints.

---

## PART 4 — Worth it but platform-limited (gate as progressive enhancement)

### Web Share Target (manifest `share_target`) — Chromium/Android-only
- **What:** Lets the **installed** wallet appear in the OS share sheet so a user
  can share a `conceal:`/`web+conceal:` URI or an address *into* the wallet
  (-> prefill Send). Complements the protocol handler from the receiving side.
- **Status (verified):** MDN **"Limited availability"** — Chromium (Android
  especially); not Safari/Firefox. GET targets land on a URL with query params
  (works with static export — the send page already parses `?uri=`); POST/file
  targets need a service-worker `fetch` interception. [MDN share_target]
- **Feasibility under constraints:** A **GET** `share_target` pointing at
  `./wallet/send?...` is static-export-friendly and needs no server. Low effort,
  real value on Android. Worth adding behind feature detection.

### Web NFC (`NDEFReader`) — Android Chrome only, experimental
- **What:** Tap-to-share/receive an address via NFC at point of sale.
- **Status (verified):** MDN **"Limited availability" + Experimental** — Chrome
  on **Android only**; no iOS, no desktop. [MDN Web NFC]
- **Verdict:** Niche but a genuinely nice in-person payment affordance on
  Android. Pure client, no backend. Only pursue if in-person CCX payments are a
  product goal; otherwise defer.

---

## PART 5 — NOT WORTH IT for this wallet

### Periodic Background Sync — SKIP
- Could in theory re-scan the chain periodically while closed, but: MDN
  **"Limited availability"**, **Chromium-only**, requires an installed PWA with
  a site-engagement heuristic, and the OS controls timing (no guarantees).
  [MDN Periodic Background Sync] It also doesn't solve the *notify-when-closed*
  problem without Push. Cost/benefit is poor and coverage is too narrow.

### Idle Detection API — SKIP (auto-lock already solved better)
- Tempting for auto-lock, but MDN **"Limited availability"**, **Chromium-only**,
  and it requires a **permission prompt** + reports *system-wide* idle/locked
  state — privacy-heavy for a wallet. [MDN Idle Detection API] The app already
  auto-locks on inactivity via in-app timers + `visibilitychange` (see
  `components/layout/wallet-shell.tsx`), which is portable and needs no
  permission. Keep the existing approach.

### Contact Picker API — SKIP
- `navigator.contacts.select()` is **Android-Chrome-only** ("Limited
  availability") and reads the device address book — privacy-sensitive and
  low value vs. the app's own encrypted address book.
  [MDN Contact Picker API] Skip.

### Vibration API (`navigator.vibrate`) — SKIP (or trivial only)
- MDN **"Limited availability"**; effectively **Android-only** (iOS Safari does
  not vibrate). [MDN Vibration API] Marginal UX value for a wallet; not worth
  the inconsistency. At most a one-liner haptic on send-confirm, optional.

### File System Access (`showSaveFilePicker` / `showOpenFilePicker`) — SKIP for now
- Would give a nicer "save encrypted backup / re-open it" UX than the current
  download + clipboard export
  (`/Users/travis/Projects/conceal-next-wallet/lib/ui/wallet-export-backup.ts`).
  But it is **Chromium-only** (secure context; Safari/Firefox fall back to
  classic download/`<input type=file>`). [MDN File System API] The current
  download-blob + copy-to-clipboard backup is portable and already works
  everywhere. Adopt only as a Chromium-only enhancement if backup UX becomes a
  priority — not a gap today.

---

## Sources (verified June 2026)
- MDN — Push API (Baseline "widely available" since Mar 2023; three-party
  server model): https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- MDN — Notifications API ("Limited availability"):
  https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API
- WebKit — "Web Push for Web Apps on iOS and iPadOS" (iOS 16.4; Home-Screen
  install + user-gesture required):
  https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Next.js — PWA guide (shows mandatory `'use server'` VAPID push server):
  https://nextjs.org/docs/app/guides/progressive-web-apps
- MDN — Badging API ("Limited availability"):
  https://developer.mozilla.org/en-US/docs/Web/API/Badging_API
- MDN — Web Share API ("Limited availability") + caniuse web-share (~91%):
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API /
  https://caniuse.com/web-share
- MDN — Web Share Target ("Limited availability", Chromium):
  https://developer.mozilla.org/en-US/docs/Web/Manifest/share_target
- MDN — Screen Wake Lock API ("Baseline 2025"):
  https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- MDN — Web NFC ("Limited availability", Experimental, Android Chrome):
  https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API
- MDN — File System API (Chromium-focused):
  https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- MDN — Periodic Background Sync ("Limited availability", Chromium):
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API
- MDN — Idle Detection ("Limited availability", Chromium, permissioned):
  https://developer.mozilla.org/en-US/docs/Web/API/Idle_Detection_API
- MDN — Contact Picker ("Limited availability", Android Chrome):
  https://developer.mozilla.org/en-US/docs/Web/API/Contact_Picker_API
- MDN — Vibration API ("Limited availability", effectively Android):
  https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API
- MDN — protocol_handlers ("Limited availability", Experimental):
  https://developer.mozilla.org/en-US/docs/Web/Manifest/protocol_handlers
- MDN — Trigger install prompt / `beforeinstallprompt` (non-standard, Chromium):
  https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt
