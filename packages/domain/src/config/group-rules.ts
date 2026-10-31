/**
 * Rules for posting a campaign in a group: which country (and so which
 * currency) a group is in, what its own rules ask for, which groups are kept
 * out, and the footer every group message carries. Shared by the API (which
 * enforces it on send) and the panel (which shows it before sending).
 */

/** What a group is about. Some kinds are never for selling. */
export type GroupCategory =
  | "ventas"
  | "emprendimiento"
  | "clientes"
  | "equipo"
  | "universidad"
  | "noticias"
  | "enlaces"
  | "familia"
  | "otro";

export const GROUP_CATEGORIES: { id: GroupCategory; label: string; neverPost: boolean }[] = [
  { id: "ventas", label: "Compra y venta", neverPost: false },
  { id: "emprendimiento", label: "Emprendedores", neverPost: false },
  { id: "clientes", label: "Mis clientes", neverPost: false },
  { id: "equipo", label: "Equipo de trabajo", neverPost: true },
  { id: "universidad", label: "Universidad o estudios", neverPost: true },
  { id: "noticias", label: "Noticias", neverPost: true },
  { id: "enlaces", label: "Enlaces y grupos de grupos", neverPost: true },
  { id: "familia", label: "Familia y amigos", neverPost: true },
  { id: "otro", label: "Otro", neverPost: false },
];

export const GROUP_CATEGORY_IDS = GROUP_CATEGORIES.map((c) => c.id);

export function categoryLabel(id: string | null | undefined): string | null {
  return GROUP_CATEGORIES.find((c) => c.id === id)?.label ?? null;
}

/** Countries a group can be in, with the currency prices are shown in. */
export const GROUP_COUNTRIES: Record<string, { name: string; dial: string; currency: string; symbol: string }> = {
  VE: { name: "Venezuela", dial: "58", currency: "VES", symbol: "Bs" },
  CO: { name: "Colombia", dial: "57", currency: "COP", symbol: "$" },
  ES: { name: "España", dial: "34", currency: "EUR", symbol: "€" },
  PE: { name: "Perú", dial: "51", currency: "PEN", symbol: "S/" },
  MX: { name: "México", dial: "52", currency: "MXN", symbol: "$" },
  AR: { name: "Argentina", dial: "54", currency: "ARS", symbol: "$" },
  CL: { name: "Chile", dial: "56", currency: "CLP", symbol: "$" },
  EC: { name: "Ecuador", dial: "593", currency: "USD", symbol: "$" },
  PA: { name: "Panamá", dial: "507", currency: "USD", symbol: "$" },
  DO: { name: "República Dominicana", dial: "1809", currency: "DOP", symbol: "RD$" },
  US: { name: "Estados Unidos", dial: "1", currency: "USD", symbol: "$" },
};

export const GROUP_COUNTRY_IDS = Object.keys(GROUP_COUNTRIES);

/** Currencies a campaign can carry a price in (one per country currency). */
export const PRICE_CURRENCIES = [...new Set(Object.values(GROUP_COUNTRIES).map((c) => c.currency))];

export const CURRENCY_LABEL: Record<string, string> = {
  VES: "Bolívares (Bs)",
  COP: "Pesos colombianos (COP)",
  EUR: "Euros (€)",
  PEN: "Soles (S/)",
  MXN: "Pesos mexicanos (MXN)",
  ARS: "Pesos argentinos (ARS)",
  CLP: "Pesos chilenos (CLP)",
  DOP: "Pesos dominicanos (RD$)",
  USD: "Dólares (USD)",
};

/** Country of a phone number from its international prefix (longest match). */
export function countryFromPhone(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  let best: { id: string; len: number } | null = null;
  for (const [id, c] of Object.entries(GROUP_COUNTRIES)) {
    if (digits.startsWith(c.dial) && (!best || c.dial.length > best.len)) best = { id, len: c.dial.length };
  }
  return best?.id ?? null;
}

/**
 * Country from a WhatsApp JID. Older group ids carry the creator's number
 * ("584121234567-1612345678@g.us"); newer ones ("1203630…@g.us") do not.
 */
export function countryFromJid(jid: string | null | undefined): string | null {
  const id = String(jid ?? "");
  if (id.endsWith("@g.us")) {
    const creator = id.split("@")[0]!.split("-");
    return creator.length === 2 ? countryFromPhone(creator[0]) : null;
  }
  if (id.endsWith("@s.whatsapp.net") || id.endsWith("@c.us")) return countryFromPhone(id.split("@")[0]);
  return null;
}

// Cities shared by two countries (Barcelona, Valencia) are left out on purpose.
const COUNTRY_WORDS: [string, RegExp][] = [
  ["VE", /\b(venezuela|venezolan[oa]s?|caracas|maracaibo|barquisimeto|maracay|margarita|puerto la cruz|lecheria|aragua|zulia|carabobo|lara|anzoategui)\b/],
  ["CO", /\b(colombia|colombian[oa]s?|bogota|medellin|cali|barranquilla|cartagena|bucaramanga|cucuta)\b/],
  ["ES", /\b(espana|espanol(es|as)?|madrid|sevilla|malaga|zaragoza|bilbao|alicante)\b/],
  ["PE", /\b(peru|peruan[oa]s?|lima|arequipa|trujillo|cusco)\b/],
  ["MX", /\b(mexico|mexican[oa]s?|cdmx|guadalajara|monterrey)\b/],
  ["AR", /\b(argentina|argentin[oa]s?|buenos aires|cordoba ar|rosario)\b/],
  ["CL", /\b(chile|chilen[oa]s?|santiago de chile)\b/],
  ["EC", /\b(ecuador|ecuatorian[oa]s?|quito|guayaquil)\b/],
  ["PA", /\b(panama|panamen[oa]s?)\b/],
  ["US", /\b(usa|estados unidos|miami|florida|houston|new york)\b/],
];

/** Lowercase without accents. */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Country named in a group's name or description ("Ventas Caracas"). */
export function countryFromText(text: string | null | undefined): string | null {
  const t = foldText(String(text ?? ""));
  if (!t) return null;
  for (const [id, re] of COUNTRY_WORDS) if (re.test(t)) return id;
  return null;
}

export type CountrySource = "manual" | "nombre" | "creador" | null;

/**
 * Where a group is: what the user set by hand wins; then a city or country in
 * its name or description; then the creator's phone prefix. Unknown → null
 * (the panel asks the user instead of guessing).
 */
export function detectGroupCountry(g: {
  country?: string | null;
  name?: string | null;
  description?: string | null;
  remoteJid?: string | null;
  ownerJid?: string | null;
}): { country: string | null; source: CountrySource } {
  if (g.country && GROUP_COUNTRIES[g.country]) return { country: g.country, source: "manual" };
  const byText = countryFromText(`${g.name ?? ""} ${g.description ?? ""}`);
  if (byText) return { country: byText, source: "nombre" };
  const byOwner = countryFromJid(g.ownerJid) ?? countryFromJid(g.remoteJid);
  if (byOwner) return { country: byOwner, source: "creador" };
  return { country: null, source: null };
}

export function currencyForCountry(country: string | null | undefined): string | null {
  return country ? (GROUP_COUNTRIES[country]?.currency ?? null) : null;
}

/** Currencies written without cents, with "." between thousands (40.000 COP). */
const WHOLE_CURRENCIES = new Set(["COP", "CLP", "PYG"]);

/**
 * The number in a price as people type it: "6.5", "6,50", "12000", "12.000",
 * "1,250.00". null when it isn't a number (or is negative).
 */
export function parseAmount(raw: string): number | null {
  const a = raw.replace(/\s+/g, "");
  if (!a || a.startsWith("-")) return null;
  let n: number;
  if (/^\d+$/.test(a)) n = Number(a);
  else if (/^\d{1,3}([.,])\d{3}(\1\d{3})*$/.test(a)) n = Number(a.replace(/[.,]/g, "")); // 12.000 / 1,250,000
  else if (/^\d+[.,]\d{1,2}$/.test(a)) n = Number(a.replace(",", ".")); // 6.5 / 6,50
  else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(a)) n = Number(a.replace(/,/g, "")); // 1,250.50
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(a)) n = Number(a.replace(/\./g, "").replace(",", ".")); // 1.250,50
  else return null;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** A price field is valid when empty or a number ≥ 0. */
export function isValidPrice(raw: string | null | undefined): boolean {
  return !raw?.trim() || parseAmount(raw) !== null;
}

/** "6.50", "12.000": the amount written the same way every time (text that isn't a number stays as typed). */
export function formatAmount(raw: string, currency: string): string {
  const n = parseAmount(raw);
  if (n === null) return raw.trim();
  if (WHOLE_CURRENCIES.has(currency)) return Math.round(n).toLocaleString("de-DE");
  const cents = !Number.isInteger(n);
  return n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
}

/** "Bs 350", "$ 40.000 COP", "9 €", "S/ 35", "$ 6.50 USD". */
export function formatPrice(amount: string, currency: string): string {
  const a = formatAmount(amount, currency);
  switch (currency) {
    case "VES":
      return `Bs ${a}`;
    case "EUR":
      return `${a} €`;
    case "PEN":
      return `S/ ${a}`;
    case "DOP":
      return `RD$ ${a}`;
    default:
      return `$ ${a} ${currency}`;
  }
}

/** What a group's own rules (its description) say about posting. */
export interface GroupRulesAnalysis {
  /** The group bans ads/sales outright. */
  forbidsAds: boolean;
  /** Posts must include a price. */
  requiresPrice: boolean;
  /** Posts must include a photo. */
  requiresImage: boolean;
  /** Only admins can send messages (WhatsApp setting). */
  onlyAdmins: boolean;
  /** Days or hours the rules mention for selling ("solo los viernes"). */
  scheduleNote: string | null;
  /** Plain-language findings, one per line, for the panel. */
  notes: string[];
}

const FORBIDS = [
  /no (se permite|se permiten|esta permitid[oa]s?|permitimos|aceptamos)\s+(la\s+)?(publicidad|propaganda|ventas?|spam|promociones|anuncios|vender)/,
  /prohibid[oa]s?\s+(la\s+)?(publicidad|propaganda|ventas?|spam|promociones|anuncios|vender)/,
  /(publicidad|propaganda|ventas?|spam|promociones|anuncios)\s+(esta[n]?\s+)?prohibid[oa]s?/,
  /cero (publicidad|spam|ventas)/,
  /sin (publicidad|spam|ventas)/,
  /no (vender|ofrecer|promocionar)/,
];
const NEEDS_PRICE = [
  /(con|incluir|incluye|indicar|colocar|poner|debe(n)? (tener|llevar|incluir)|obligatorio( el)?)\s+(el\s+|su\s+)?precio/,
  /precio (obligatorio|visible|siempre)/,
  /sin precio (no|sera[n]? eliminad)/,
];
const NEEDS_IMAGE = [
  /(con|incluir|incluye|debe(n)? (tener|llevar|incluir)|obligatori[oa])\s+(una\s+|la\s+|su\s+)?(foto|imagen|fotografia)/,
  /(foto|imagen) (obligatoria|del producto|real)/,
  /sin (foto|imagen) (no|sera[n]? eliminad)/,
];
const DAYS = /(solo|unicamente|solamente)\s+(los?\s+)?(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?|fines de semana)([^.\n]{0,40})/;

export function analyzeGroupRules(text: string | null | undefined, onlyAdmins = false): GroupRulesAnalysis {
  const t = foldText(String(text ?? ""));
  const forbidsAds = FORBIDS.some((re) => re.test(t));
  const requiresPrice = NEEDS_PRICE.some((re) => re.test(t));
  const requiresImage = NEEDS_IMAGE.some((re) => re.test(t));
  const day = t.match(DAYS);
  const scheduleNote = day ? day[0].trim() : null;
  const notes: string[] = [];
  if (onlyAdmins) notes.push("Solo los administradores pueden escribir en este grupo.");
  if (forbidsAds) notes.push("Las reglas prohíben publicidad o ventas.");
  if (requiresPrice) notes.push("Las reglas piden publicar con precio.");
  if (requiresImage) notes.push("Las reglas piden publicar con foto.");
  if (scheduleNote) notes.push(`Las reglas limitan cuándo vender: «${scheduleNote}».`);
  if (!t.trim() && !onlyAdmins) notes.push("El grupo no tiene reglas escritas en su descripción.");
  else if (notes.length === 0) notes.push("No vimos nada en las reglas que impida publicar.");
  return { forbidsAds, requiresPrice, requiresImage, onlyAdmins, scheduleNote, notes };
}

/** The group settings that decide whether a campaign can go there. */
export interface GroupPostingInfo {
  name: string;
  excluded?: boolean;
  category?: string | null;
  requiresPrice?: boolean;
  requiresImage?: boolean;
  onlyAdmins?: boolean;
  forbidsAds?: boolean;
  country?: string | null;
  description?: string | null;
  remoteJid?: string | null;
  ownerJid?: string | null;
}

export interface CampaignPostingInfo {
  hasImage: boolean;
  /** currency → amount text, e.g. { VES: "350", COP: "40.000" }. */
  prices?: Record<string, string> | null;
  /** The message has {{precio}}: every group then needs a price in its currency. */
  usesPrice?: boolean;
}

/** True when a message uses the {{precio}} variable. */
export function usesPriceVar(message: string | null | undefined): boolean {
  return /\{\{\s*precio\s*\}\}/.test(message ?? "");
}

/**
 * Why a campaign cannot go to a group (empty → it can). Kept-out groups and
 * groups whose rules ban selling are never posted to; a group that asks for a
 * price needs one in its own currency, and one that asks for a photo needs an
 * image.
 */
export function groupPostingProblems(g: GroupPostingInfo, c: CampaignPostingInfo): string[] {
  const out: string[] = [];
  if (g.excluded) out.push("Apartado: nunca se publica aquí.");
  const cat = GROUP_CATEGORIES.find((x) => x.id === g.category);
  if (cat?.neverPost) out.push(`Es un grupo de «${cat.label}»: no se publica publicidad.`);
  if (g.onlyAdmins) out.push("Solo los administradores pueden escribir.");
  if (g.forbidsAds) out.push("Sus reglas prohíben publicidad.");
  if (g.requiresImage && !c.hasImage) out.push("Exige publicar con foto y la campaña no tiene imagen.");
  if (g.requiresPrice || c.usesPrice) {
    const why = g.requiresPrice ? "Exige precio" : "El mensaje usa {{precio}}";
    const { country } = detectGroupCountry(g);
    const currency = currencyForCountry(country);
    if (!currency) out.push(`${why} y no sabemos de qué país es: indica el país del grupo.`);
    else if (!c.prices?.[currency]?.trim()) out.push(`${why} y la campaña no tiene precio en ${CURRENCY_LABEL[currency] ?? currency}.`);
  }
  return out;
}

/** {{precio}} for a group: the campaign price in the group's currency, or "". */
export function priceForGroup(g: GroupPostingInfo, prices: Record<string, string> | null | undefined): string {
  const currency = currencyForCountry(detectGroupCountry(g).country);
  const amount = currency ? prices?.[currency]?.trim() : "";
  return currency && amount ? formatPrice(amount, currency) : "";
}

/** Official site of NV Marketing, credited at the end of every group message. */
export const NV_MARKETING_URL = "https://nvmarketing.nvcorx.com/";

/** Official contact email of NV Marketing. */
export const NV_CONTACT_EMAIL = "nvmarketing@nvcorx.com";

export interface SocialLink {
  /** "Instagram", "TikTok", "Facebook"… */
  label: string;
  url: string;
}

/**
 * Footer appended to group messages: the brand's social links, then its
 * website, then the NV Marketing credit.
 */
export function campaignFooter(brand: { socialLinks?: SocialLink[] | null; website?: string | null }): string {
  const lines: string[] = [];
  for (const s of brand.socialLinks ?? []) {
    if (s.url?.trim()) lines.push(`${s.label?.trim() || "Redes"}: ${s.url.trim()}`);
  }
  if (brand.website?.trim()) lines.push(`Web: ${brand.website.trim()}`);
  lines.push(`Mensaje enviado con NV Marketing ${NV_MARKETING_URL}`);
  return lines.join("\n");
}

/** Message + footer, with a blank line between them. */
export function withFooter(message: string, footer: string): string {
  const body = message.trimEnd();
  return body ? `${body}\n\n${footer}` : footer;
}
