No findings.

Checked:
- lib/messages/thread-mappers.ts:8 - moved resolveThreadKeyFromMeta/findAddressBookContact/compareMessagesChronological/sortMessagesByHeight bodies match the deleted lib/wallet-core/mappers.ts diff; messageChronologyHeight still maps blockHeight <= 0 to Number.MAX_SAFE_INTEGER.
- lib/messages/thread-mappers.ts:4 - imports stay neutral: thread-key, types, validation/ccx only; no wallet-core import.
- lib/types/index.ts:145 - RawAddressEntry shape remains id/label/address/paymentId?/avatar?.
- lib/wallet-core/Wallet.ts:84 - RawAddressEntry re-export preserves ./Wallet consumers.
- lib/wallet-core/mappers.ts:33 - buildMessageThreadKey import/re-export remains; line 34 internal findAddressBookContact use resolves through thread-mappers; removed validation/ccx import is not needed.
- lib/services/real-sdk/address-book.service.ts:1 - SDK RawAddressEntry import from conceal-wallet-sdk remains untouched.
- lib/wallet-core/wallet-operations.ts:20 - remaining direct importer of findAddressBookContact from @/lib/wallet-core/mappers is covered by the back-compat re-export.

Verification:
- npm run types
- npm test -- tests/wallet-mappers.test.ts
