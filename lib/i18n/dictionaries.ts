import type { Dictionary, Locale } from "@/lib/i18n/i18n";

/**
 * Translation dictionaries. English is the source/fallback; `es` covers the same
 * keys. Keep keys namespaced by area (nav.*, action.*, …). Spanish here uses
 * standard crypto-wallet terminology and should be community-reviewed before
 * being treated as final.
 */
const en: Dictionary = {
  // Sidebar navigation
  "nav.account": "Account",
  "nav.market": "Market",
  "nav.transactions": "Transactions",
  "nav.send": "Send",
  "nav.receive": "Receive",
  "nav.deposits": "Deposits",
  "nav.messages": "Messages",
  "nav.addressBook": "Address Book",
  "nav.settings": "Settings",
  "nav.export": "Export",
  "nav.network": "Network",
  "nav.donate": "Donate",
  // Common actions / chrome
  "action.disconnect": "Disconnect",
  "action.cancel": "Cancel",
  "action.confirm": "Confirm",
  "action.copy": "Copy",
  "action.copied": "Copied",
  "action.save": "Save",
  "action.close": "Close",
  "action.expandMenu": "Expand menu",
  "action.collapseMenu": "Collapse menu",
  "action.openNavigation": "Open navigation",
  // Theme switch
  "theme.label": "Theme",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",
  // Settings
  "settings.language": "Language",
  "settings.languageDescription": "Display language for the wallet interface",
};

const es: Dictionary = {
  "nav.account": "Cuenta",
  "nav.market": "Mercado",
  "nav.transactions": "Transacciones",
  "nav.send": "Enviar",
  "nav.receive": "Recibir",
  "nav.deposits": "Depósitos",
  "nav.messages": "Mensajes",
  "nav.addressBook": "Libreta de direcciones",
  "nav.settings": "Ajustes",
  "nav.export": "Exportar",
  "nav.network": "Red",
  "nav.donate": "Donar",
  "action.disconnect": "Desconectar",
  "action.cancel": "Cancelar",
  "action.confirm": "Confirmar",
  "action.copy": "Copiar",
  "action.copied": "Copiado",
  "action.save": "Guardar",
  "action.close": "Cerrar",
  "action.expandMenu": "Expandir menú",
  "action.collapseMenu": "Contraer menú",
  "action.openNavigation": "Abrir navegación",
  "theme.label": "Tema",
  "theme.system": "Sistema",
  "theme.light": "Claro",
  "theme.dark": "Oscuro",
  "settings.language": "Idioma",
  "settings.languageDescription": "Idioma de la interfaz de la cartera",
};

export const DICTIONARIES: Record<Locale, Dictionary> = { en, es };
