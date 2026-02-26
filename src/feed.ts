import { XMLParser } from "fast-xml-parser";
import type { FeedItem } from "./types.js";

const RSS_URL =
  process.env.BEEHIIV_RSS_URL ?? "https://rss.beehiiv.com/feeds/9AbhG8CTgD.xml";

export async function fetchFeed(): Promise<FeedItem[]> {
  console.log(`[feed] Fetching RSS feed: ${RSS_URL}`);

  const res = await fetch(RSS_URL, {
    headers: { "User-Agent": "EnterpriseVibeCode-CrossPoster/1.0" },
  });

  if (!res.ok) {
    throw new Error(`[feed] RSS fetch failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const parsed = parser.parse(xml);

  const channel = parsed?.rss?.channel;
  if (!channel) {
    throw new Error("[feed] Invalid RSS: no channel element found");
  }

  // Normalize to array (single-item feeds return an object)
  const rawItems = Array.isArray(channel.item)
    ? channel.item
    : channel.item
      ? [channel.item]
      : [];

  const items: FeedItem[] = rawItems.map((item: Record<string, unknown>) => {
    const content =
      (item["content:encoded"] as string) ??
      (item.description as string) ??
      "";

    // Try to extract first image from content
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);

    // guid may be an object with attributes (e.g. { "#text": "...", "@_isPermaLink": "false" })
    const rawGuid = item.guid;
    const guid =
      typeof rawGuid === "object" && rawGuid !== null
        ? String((rawGuid as Record<string, unknown>)["#text"] ?? item.link ?? "")
        : String(rawGuid ?? item.link ?? "");

    return {
      guid,
      title: String(item.title ?? "Untitled"),
      link: String(item.link ?? ""),
      content,
      description: String(item.description ?? ""),
      pubDate: String(item.pubDate ?? new Date().toISOString()),
      imageUrl: imgMatch?.[1],
    };
  });

  console.log(`[feed] Found ${items.length} items in feed`);
  return items;
}
