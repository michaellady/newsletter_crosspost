import type { FeedItem, PublishPayload } from "./types.js";

const CANONICAL_FOOTER = `<hr><p><em>This post was originally published on <a href="https://www.enterprisevibecode.com">Enterprise Vibe Code</a>. Subscribe for weekly insights on AI-assisted development and DevOps.</em></p>`;

/**
 * Strip Beehiiv-specific elements from HTML content:
 * - Subscribe/share widgets
 * - Tracking pixels
 * - Beehiiv footer branding
 */
function cleanBeehiivHtml(html: string): string {
  let cleaned = html;

  // Remove Beehiiv tracking pixels (1x1 images, beacon URLs)
  cleaned = cleaned.replace(
    /<img[^>]*(?:tracking|beacon|pixel|open\.beehiiv)[^>]*\/?>/gi,
    ""
  );

  // Remove Beehiiv subscribe buttons/forms
  cleaned = cleaned.replace(
    /<div[^>]*class="[^"]*subscribe[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );

  // Remove Beehiiv share widgets
  cleaned = cleaned.replace(
    /<div[^>]*class="[^"]*share[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );

  // Remove Beehiiv footer/branding blocks
  cleaned = cleaned.replace(
    /<div[^>]*class="[^"]*beehiiv[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    ""
  );

  // Remove empty paragraphs left behind
  cleaned = cleaned.replace(/<p>\s*<\/p>/g, "");

  // Normalize whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}

/**
 * Extract a plain-text description/excerpt from HTML content.
 */
function extractDescription(html: string, maxLength = 200): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s\S*$/, "") + "…";
}

/**
 * Prepare content for Medium.
 * With Playwright, the title goes in the editor's title field separately.
 * We add a canonical footer since we set canonicalUrl via story settings.
 */
export function transformForMedium(item: FeedItem): PublishPayload {
  const cleaned = cleanBeehiivHtml(item.content);

  const htmlContent = `${cleaned}\n${CANONICAL_FOOTER}`;

  return {
    title: item.title,
    htmlContent,
    canonicalUrl: item.link,
    description: extractDescription(item.content),
    imageUrl: item.imageUrl,
  };
}

/**
 * Prepare content for Substack.
 * Substack editor accepts HTML pasted in. We add a canonical footer since
 * Substack doesn't support canonical URLs.
 */
export function transformForSubstack(item: FeedItem): PublishPayload {
  const cleaned = cleanBeehiivHtml(item.content);

  // Add canonical attribution footer
  const htmlContent = `${cleaned}\n${CANONICAL_FOOTER}`;

  return {
    title: item.title,
    htmlContent,
    canonicalUrl: item.link,
    description: extractDescription(item.content),
    imageUrl: item.imageUrl,
  };
}

/**
 * Prepare content for LinkedIn Newsletter.
 * LinkedIn's article editor accepts HTML. We add a canonical footer.
 */
export function transformForLinkedIn(item: FeedItem): PublishPayload {
  const cleaned = cleanBeehiivHtml(item.content);

  const htmlContent = `${cleaned}\n${CANONICAL_FOOTER}`;

  return {
    title: item.title,
    htmlContent,
    canonicalUrl: item.link,
    description: extractDescription(item.content),
    imageUrl: item.imageUrl,
  };
}
