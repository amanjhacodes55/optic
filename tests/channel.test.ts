import { describe, expect, it } from "vitest";
import { classifyChannel, referrerDomain } from "@/lib/channel";

describe("referrerDomain", () => {
  it("strips www and lowercases", () => {
    expect(referrerDomain("https://WWW.Google.com/search?q=x")).toBe("google.com");
  });
  it("returns null for empty or invalid referrers", () => {
    expect(referrerDomain("")).toBeNull();
    expect(referrerDomain("not a url")).toBeNull();
  });
});

describe("classifyChannel", () => {
  const c = (o: Parameters<typeof classifyChannel>[0]) => classifyChannel({ siteDomain: "shop.example", ...o });

  it("is Direct with no referrer and no UTM", () => expect(c({})).toBe("Direct"));
  it("treats the site's own domain as Direct", () => expect(c({ referrerDomain: "blog.shop.example" })).toBe("Direct"));
  it("detects organic search", () => expect(c({ referrerDomain: "google.com" })).toBe("Organic Search"));
  it("detects organic social, including t.co", () => {
    expect(c({ referrerDomain: "reddit.com" })).toBe("Organic Social");
    expect(c({ referrerDomain: "t.co" })).toBe("Organic Social");
  });
  it("falls back to Referral", () => expect(c({ referrerDomain: "coffeegeek.com" })).toBe("Referral"));
  it("lets UTM medium win over the referrer", () => {
    expect(c({ referrerDomain: "google.com", utmMedium: "email" })).toBe("Email");
    expect(c({ utmSource: "google", utmMedium: "cpc" })).toBe("Paid Search");
    expect(c({ utmSource: "facebook", utmMedium: "cpc" })).toBe("Paid Social");
    expect(c({ utmSource: "instagram", utmMedium: "paid_social" })).toBe("Paid Social");
    expect(c({ utmMedium: "display" })).toBe("Display");
    expect(c({ utmMedium: "affiliate" })).toBe("Affiliates");
  });
});
