// Seed-phrase languages offered in the import flow. These MUST stay in lock-step with
// the languages the active wallet engine can actually decode — the selected key is passed
// straight through to the SDK as a `SeedLanguage` (only "auto" → detect). The default
// SDK engine (conceal-wallet-sdk → conceal-lib-js) ships exactly these wordlists; the list
// previously advertised french/italian/chinese/dutch/esperanto/lojban/russian/ukrainian,
// none of which the SDK can decode, so picking one failed the import (#10). Adding more
// requires the corresponding wordlists in conceal-lib-js (a separate, larger change).
export const MNEMONIC_IMPORT_LANGUAGES = [
  { key: "auto", label: "Detect automatically" },
  { key: "english", label: "English" },
  { key: "spanish", label: "Spanish" },
  { key: "portuguese", label: "Portuguese" },
  { key: "japanese", label: "Japanese" },
  { key: "electrum", label: "Electrum" },
] as const;

export type MnemonicImportLanguageKey = (typeof MNEMONIC_IMPORT_LANGUAGES)[number]["key"];
