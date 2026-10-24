// Default channel grouping, modelled on GA4's rules: UTM medium wins when present, otherwise
// the referrer's domain decides, otherwise the visit is Direct.

export const CHANNELS = [
  "Direct",
  "Organic Search",
  "Paid Search",
  "Organic Social",
  "Paid Social",
  "Email",
  "Referral",
  "Display",
  "Affiliates",
] as const;
export type Channel = (typeof CHANNELS)[number];

const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|baidu|yandex|ecosia|brave|startpage|naver|qwant)\./;
const SOCIAL = /(^|\.)(facebook|fb|instagram|t\.co|twitter|x|linkedin|lnkd|reddit|pinterest|youtube|tiktok|threads|mastodon|quora|whatsapp|telegram)\.|^t\.co$|^x\.com$/;
const EMAIL = /(^|\.)(mail\.google|outlook\.live|mail\.yahoo|mail\.proton)\./;

export function referrerDomain(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function classifyChannel(input: {
  referrerDomain?: string | null;
  siteDomain?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
}): Channel {
  const medium = (input.utmMedium ?? "").toLowerCase();
  const source = (input.utmSource ?? "").toLowerCase();
  const ref = input.referrerDomain ?? "";

  if (medium) {
    if (/^(cpc|ppc|paid|paidsearch|paid_search|sem)$/.test(medium)) {
      return SOCIAL.test(source + ".") || /facebook|instagram|linkedin|tiktok|twitter|reddit|snapchat/.test(source)
        ? "Paid Social"
        : "Paid Search";
    }
    if (/^(paid_?social|social_?paid|social-paid)$/.test(medium)) return "Paid Social";
    if (/^(social|social-network|social-media|sm|organic_social)$/.test(medium)) return "Organic Social";
    if (/^(email|e-mail|newsletter)$/.test(medium)) return "Email";
    if (/^(display|banner|cpm|interstitial)$/.test(medium)) return "Display";
    if (/^affiliate/.test(medium)) return "Affiliates";
    if (medium === "organic") return "Organic Search";
    if (medium === "referral") return "Referral";
  }

  if (!ref) return "Direct";
  if (input.siteDomain && (ref === input.siteDomain || ref.endsWith("." + input.siteDomain))) return "Direct";
  if (EMAIL.test(ref + ".")) return "Email";
  if (SEARCH.test(ref + ".")) return "Organic Search";
  if (SOCIAL.test(ref + ".") || SOCIAL.test(ref)) return "Organic Social";
  return "Referral";
}
