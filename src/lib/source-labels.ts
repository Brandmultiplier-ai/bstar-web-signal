/**
 * Plain-English names for GA4 source / medium pairs. GA4 stores whatever the
 * link's utm tags or referrer said, so the same place can arrive under several
 * spellings (`facebook.com`, `m.facebook.com`, `fb`). Unknown pairs fall back
 * to the raw values, never to a guess.
 */

export type SourceKind =
  | "direct"
  | "email"
  | "search"
  | "ai"
  | "social"
  | "referral"
  | "internal"
  | "testing"
  | "unknown";

export type SourceLabel = {
  /** Short name for lists, e.g. "Google search". */
  name: string;
  kind: SourceKind;
  /** One sentence on what this source means. */
  explain: string;
  /** Raw GA4 values, always shown somewhere so nothing is hidden. */
  raw: string;
};

const SEARCH: Record<string, string> = {
  google: "Google",
  bing: "Bing",
  "cn.bing.com": "Bing",
  yahoo: "Yahoo",
  "search.yahoo.com": "Yahoo",
  "in.search.yahoo.com": "Yahoo",
  duckduckgo: "DuckDuckGo",
  ecosia: "Ecosia",
  baidu: "Baidu",
  yandex: "Yandex",
};

const AI: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "gemini.google.com": "Gemini",
  "copilot.com": "Copilot",
  "copilot.microsoft.com": "Copilot",
  "perplexity.ai": "Perplexity",
  "www.perplexity.ai": "Perplexity",
  "claude.ai": "Claude",
};

const SOCIAL: Record<string, string> = {
  facebook: "Facebook",
  "facebook.com": "Facebook",
  "m.facebook.com": "Facebook",
  "l.facebook.com": "Facebook",
  "lm.facebook.com": "Facebook",
  fb: "Facebook",
  ig: "Instagram",
  instagram: "Instagram",
  "instagram.com": "Instagram",
  "l.instagram.com": "Instagram",
  linkedin: "LinkedIn",
  "linkedin.com": "LinkedIn",
  "lnkd.in": "LinkedIn",
  "youtube.com": "YouTube",
  "m.youtube.com": "YouTube",
  youtube: "YouTube",
  "t.co": "X (Twitter)",
  "x.com": "X (Twitter)",
  "twitter.com": "X (Twitter)",
  reddit: "Reddit",
  "reddit.com": "Reddit",
};

/** Email tools whose name appears as the utm source. */
const EMAIL_TOOLS: Record<string, string> = {
  encharge: "Encharge",
  mailchimp: "Mailchimp",
  hubspot: "HubSpot",
  substack: "Substack",
  convertkit: "ConvertKit",
  beehiiv: "beehiiv",
  klaviyo: "Klaviyo",
};

const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsocial", "paid_social", "paid-social", "cpm", "display"]);

function clean(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isTesting(source: string): boolean {
  return (
    source.startsWith("localhost") ||
    source.startsWith("127.0.0.1") ||
    source.endsWith(".vercel.app") ||
    source === "tagassistant.google.com" ||
    source.startsWith("qa_")
  );
}

export function sourceLabel(sourceValue: string, mediumValue: string): SourceLabel {
  const source = clean(sourceValue);
  const medium = clean(mediumValue);
  const raw = `${sourceValue} / ${mediumValue}`;
  const paid = PAID_MEDIUMS.has(medium);

  if (source === "(direct)") {
    return {
      name: "Direct or unknown",
      kind: "direct",
      explain:
        "Typed the address, used a bookmark, or came from an app or email client that does not pass on where the visitor came from.",
      raw,
    };
  }
  if (source === "(not set)" || source === "") {
    return { name: "Not recorded", kind: "unknown", explain: "GA4 did not record a source for these sessions.", raw };
  }
  if (isTesting(source)) {
    return {
      name: "Internal testing",
      kind: "testing",
      explain: "Visits from a development machine, a preview build or a tagging tool, not from real visitors.",
      raw,
    };
  }
  if (medium === "internal") {
    return { name: "Link from our own site", kind: "internal", explain: "A link on the site tagged as internal.", raw };
  }

  const tool = EMAIL_TOOLS[source];
  if (tool || medium === "email" || medium === "newsletter") {
    const name = tool ?? sourceValue;
    const tag = tool && medium && medium !== "email" && medium !== "(none)" && medium !== "(not set)" ? ` (${mediumValue})` : "";
    return {
      name: `${name} email${tag}`,
      kind: "email",
      explain: tag
        ? `Links in emails sent from ${name}, tagged "${mediumValue}" in the link.`
        : `Links in emails sent from ${name}.`,
      raw,
    };
  }

  if (AI[source]) {
    return {
      name: AI[source],
      kind: "ai",
      explain: `A link ${AI[source]} showed in one of its answers.`,
      raw,
    };
  }

  const engine = SEARCH[source];
  if (engine && !paid) {
    return { name: `${engine} search`, kind: "search", explain: `Clicked a ${engine} search result.`, raw };
  }
  if (engine && paid) {
    return { name: `${engine} ads`, kind: "search", explain: `Clicked a paid ${engine} ad.`, raw };
  }

  const network = SOCIAL[source];
  if (network) {
    if (paid) return { name: `${network} ads`, kind: "social", explain: `Clicked a paid ${network} ad.`, raw };
    if (medium === "dm") {
      return { name: `${network} message`, kind: "social", explain: `A link sent in a ${network} direct message.`, raw };
    }
    return { name: network, kind: "social", explain: `A link on ${network}: a post, a profile or a shared message.`, raw };
  }

  if (medium === "organic") {
    return { name: `${sourceValue} search`, kind: "search", explain: `Clicked a search result on ${sourceValue}.`, raw };
  }
  if (medium === "referral") {
    return { name: sourceValue, kind: "referral", explain: `Clicked a link on ${sourceValue}.`, raw };
  }

  return { name: raw, kind: "unknown", explain: "A tagged link whose source is not one we recognise.", raw };
}
