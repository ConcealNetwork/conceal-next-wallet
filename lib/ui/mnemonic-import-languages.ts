export const MNEMONIC_IMPORT_LANGUAGES = [
  { key: "auto", label: "Detect automatically" },
  { key: "english", label: "English" },
  { key: "chinese", label: "Chinese (simplified)" },
  { key: "dutch", label: "Dutch" },
  { key: "electrum", label: "Electrum" },
  { key: "esperanto", label: "Esperanto" },
  { key: "french", label: "French" },
  { key: "italian", label: "Italian" },
  { key: "japanese", label: "Japanese" },
  { key: "lojban", label: "Lojban" },
  { key: "portuguese", label: "Portuguese" },
  { key: "russian", label: "Russian" },
  { key: "spanish", label: "Spanish" },
  { key: "ukrainian", label: "Ukrainian" },
] as const;

export type MnemonicImportLanguageKey = (typeof MNEMONIC_IMPORT_LANGUAGES)[number]["key"];
