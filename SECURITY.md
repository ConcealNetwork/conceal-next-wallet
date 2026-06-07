# Security Policy

Conceal Next Wallet is a **non-custodial, in-browser wallet**. In real-wallet
mode your spend/view keys are generated and stored **on your device** (encrypted
in IndexedDB) and are never transmitted to any server. Because of this, a
vulnerability in this application can directly put user funds at risk — we take
reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately via GitHub's **[Report a vulnerability](https://github.com/ConcealNetwork/conceal-next-wallet/security/advisories/new)**
(Security → Advisories). If you cannot use GitHub Advisories, reach the Conceal
team through the official community channels listed at <https://conceal.network>.

Please include:

- A description of the issue and its impact (e.g. key exposure, unauthorized
  transaction, XSS, supply-chain).
- Steps to reproduce or a proof of concept.
- Affected version / commit and environment (browser, mode).

We aim to acknowledge reports within a few days and will keep you updated on
remediation. Please give us reasonable time to ship a fix before any public
disclosure.

## In scope

- This web application (`conceal-next-wallet`): key handling, encryption,
  storage, transaction construction, the import/export flows, and the build/
  deploy pipeline.
- Dependency / supply-chain issues affecting the shipped bundle.

## Out of scope

- The Conceal daemon, network, and consensus (report those to
  [conceal-core](https://github.com/ConcealNetwork/conceal-core)).
- Third-party/public remote nodes you choose to connect to.
- Issues requiring a already-compromised device or browser.

## Supported versions

Security fixes target the latest release and the `main` branch.
