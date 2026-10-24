// A small, dependency-free user-agent parser. It covers the browsers and systems that make up
// nearly all real traffic; anything else falls into "Other" rather than guessing.

export type ParsedUA = { browser: string; os: string; device: "Desktop" | "Mobile" | "Tablet" };

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|monitor|curl|wget|python-requests|axios|go-http|preview|facebookexternalhit|embedly|quora link|vkshare|whatsapp/i;

export function isBot(ua: string): boolean {
  return !ua || BOT.test(ua);
}

export function parseUA(ua: string, screenWidth?: number): ParsedUA {
  let browser = "Other";
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser\//.test(ua)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = "Firefox";
  else if (/Chrome\/|CriOS\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";

  let os = "Other";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  let device: ParsedUA["device"] = "Desktop";
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) device = "Tablet";
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) device = "Mobile";
  else if (screenWidth && screenWidth < 768) device = "Mobile";

  return { browser, os, device };
}
