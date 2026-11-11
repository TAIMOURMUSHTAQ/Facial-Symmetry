/* gettext-style translation: the English text is the key.
   t("Start camera") returns the active language's string, or the English text when no translation exists.
   Placeholders use {name}: t("Step {n} of {total}", { n: 2, total: 9 }).
   To add a language, create src/i18n/<code>.js exporting a { "English": "Translation" } map and register it below. */

const dictionaries = { en: {} };
const RTL = new Set(["ur", "ar"]);
let lang = "en";

export function registerLanguage(code, map) { dictionaries[code] = map; }
export function setLang(code) { lang = dictionaries[code] ? code : "en"; return lang; }
export const getLang = () => lang;
export const dir = () => (RTL.has(lang) ? "rtl" : "ltr");

export function t(text, params) {
  const s = (dictionaries[lang] && dictionaries[lang][text]) || text;
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m)) : s;
}

/** "patient right" / "patient left" / "both sides" */
export function sideName(side) {
  return side === "R" ? t("patient's right") : side === "L" ? t("patient's left") : side === "both" ? t("both sides") : "";
}
