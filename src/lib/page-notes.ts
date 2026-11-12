import { normalisePath } from "./read/page-detail";

/**
 * What a page is for, written by the team, keyed by site slug and then by
 * path as GA4 reports it. Shown above the numbers in the page views. Leave a
 * page out rather than guess: the page's own title and description are
 * shown either way.
 *
 * Example:
 *   brandmultiplier: {
 *     "/pricing": "The pricing page linked from every proposal email.",
 *   },
 */
const NOT_ON_BRANDMULTIPLIER =
  "Nothing in the brandmultiplier.ai site defines this address. There is no page, redirect, or link to it, so the site cannot say what it is for.";

export const PAGE_NOTES: Record<string, Record<string, string>> = {
  brandmultiplier: {
    "/encharge-click-detection":
      "Nothing in the brandmultiplier.ai site defines this address. There is no page, redirect, email template, or mention of encharge-click-detection, so the site cannot say what the link is for.",
    "/about": NOT_ON_BRANDMULTIPLIER,
    "/career": NOT_ON_BRANDMULTIPLIER,
    "/careers": NOT_ON_BRANDMULTIPLIER,
    "/jobs": NOT_ON_BRANDMULTIPLIER,
    "/portfolio": NOT_ON_BRANDMULTIPLIER,
    "/vacancies": NOT_ON_BRANDMULTIPLIER,
    "/sitemap.xm":
      "The site does not have this address. It publishes /sitemap.xml, the public list of its pages. Analytics stored the name cut off at sitemap.xm.",
  },
  chrisrubincreativ: {
    "/how-sentiment-analysis-shapes-crisis-responses":
      "A retired blog post about crisis sentiment, taken down as off-brand. Opening it shows the retired-page screen and returns 410 Gone.",
    "/how-to-measure-emotional-impact-in-branding":
      "A retired blog post about measuring emotional impact in branding. Opening it redirects to the essay /why-some-brands-move-us/.",
    "/brand-positioning-vs-brand-identity-key-differences-explained":
      "A retired comparison of brand positioning and brand identity. Opening it redirects to /5-successful-brand-repositioning-case-studies/.",
    "/5-metrics-for-measuring-event-brand-awareness":
      "A retired blog post about event brand-awareness metrics. It re-attributed the Red Cross and Hard Rock results to event work. Opening it shows the retired-page screen and returns 410 Gone.",
    "/digital-tech-in-pop-ups-case-studies":
      "A retired blog post about technology in pop-up retail. It misattributed the Microsoft result to pop-ups. Opening it shows the retired-page screen and returns 410 Gone.",
    "/how-brand-tone-impacts-customer-perception":
      "A retired blog post about brand tone and customer perception. It claimed tone-training programs the studio does not offer. Opening it shows the retired-page screen and returns 410 Gone.",
    "/process":
      "The old Movere process page, four steps. Opening it redirects to the method section on About, /about/#method.",
    "/b2b-vs-b2c-brand-strategy-a-comparative-analysis":
      "A retired comparison of B2B and B2C brand strategy. Opening it redirects to /7-brand-strategy-frameworks-that-drive-business-growth/.",
    "/resultsmovere":
      "The old Results page. Opening it redirects to the case-study library at /work/.",
    "/how-language-impacts-brand-name-success":
      "A retired blog post about language and brand names, taken down as outside the studio's work. Opening it shows the retired-page screen and returns 410 Gone.",
    "/early-crisis-detection-with-social-media-sentiment":
      "A retired blog post about spotting a crisis through social-media sentiment, taken down as off-brand. Opening it shows the retired-page screen and returns 410 Gone.",
    "/brand-messaging-guide-from-strategy-to-implementation":
      "A retired messaging guide that overlapped the messaging hub. Opening it shows the retired-page screen and returns 410 Gone.",
    "/behavioral-segmentation-for-price-sensitive-audiences":
      "A retired blog post about segmenting price-sensitive audiences. Opening it shows the retired-page screen and returns 410 Gone.",
    "/5-steps-to-define-brand-purpose":
      "A retired long post on defining brand purpose. Opening it redirects to the homepage.",
    "/5-common-brand-identity-problems-and-their-solutions":
      "A retired long post on brand-identity problems. Opening it redirects to the homepage.",
    "/top-brand-strategy-tools-for-startups-in-2025":
      "A retired 2025 list of brand-strategy tools. Opening it shows the retired-page screen and returns 410 Gone.",
    "/how-predictive-analytics-shapes-brand-strategy":
      "A retired blog post about predictive analytics, taken down as off-brand. Opening it shows the retired-page screen and returns 410 Gone.",
    "/why-consistency-in-brand-voice-drives-growth":
      "A retired blog post on brand voice that invented a method name the studio does not use. Opening it shows the retired-page screen and returns 410 Gone.",
    "/avoiding-legal-issues-in-content-marketing":
      "A retired blog post offering legal advice, taken down because a brand studio should not give it. Opening it shows the retired-page screen and returns 410 Gone.",
    "/how-to-measure-brand-consistency":
      "A retired blog post about measuring brand consistency. It invented services the studio does not offer. Opening it shows the retired-page screen and returns 410 Gone.",
    "/case-studies-success-with-community-centric-brands":
      "A retired set of case studies about community brands. It quoted Movere out of context. Opening it shows the retired-page screen and returns 410 Gone.",
    "/how-to-prioritize-usability-issues-in-testing":
      "A retired blog post about usability testing, taken down as off-brand. Opening it shows the retired-page screen and returns 410 Gone.",
  },
};

export function pageNote(siteSlug: string | undefined, path: string | null | undefined): string | null {
  const key = normalisePath(path);
  if (!key || !siteSlug) return null;
  const notes = PAGE_NOTES[siteSlug];
  if (!notes) return null;
  if (notes[key]) return notes[key];
  for (const [noted, note] of Object.entries(notes)) {
    if (normalisePath(noted) === key) return note;
  }
  return null;
}
