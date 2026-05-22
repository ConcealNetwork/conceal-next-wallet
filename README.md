# Conceal Next Wallet Mockup

This is a Next.js 14 App Router recreation of the Conceal CCX wallet mockup.

## Mock-only safety warning

This project is a UI mockup with mock data only. It does not generate, derive, validate, store, import, export, or transmit real wallet keys, seeds, mnemonics, transactions, or RPC calls. Do not use it with real CCX funds. Any production wallet must add genuine key security, cryptography, storage, and backend wallet handling separately.

## Run

```bash
npm install
npm run dev
```

## Verify

```bash
npm run build
npm run lint
npm test
npm run test:e2e
```

## Backend wiring guide

The UI talks to typed services only. Interfaces live in `lib/services/*.service.ts`, mock implementations live in `lib/services/mock`, and the single swap point is `lib/services/index.ts`.

To wire a real backend:

1. Implement the interfaces in `lib/services` with real wallet/RPC calls in a new folder such as `lib/services/real`.
2. Preserve the same method signatures and return the domain models from `lib/types`.
3. Change only `lib/services/index.ts` so `getWalletServices()` returns the real service bundle when `NEXT_PUBLIC_USE_MOCK=false`.
4. Keep key generation, seed handling, and secret storage outside this mock UI until a proper audited wallet backend exists.

Every mock service method includes a `// TODO(backend)` marker showing where the real implementation boundary belongs.
