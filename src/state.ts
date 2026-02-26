import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  StateFile,
  PublishedPost,
  FeedItem,
  DestinationName,
  DestinationResult,
} from "./types.js";

const STATE_PATH = resolve(process.cwd(), "published.json");
const MAX_RETRIES = 3;

function loadState(): StateFile {
  if (!existsSync(STATE_PATH)) {
    return { posts: [] };
  }
  const raw = readFileSync(STATE_PATH, "utf-8");
  return JSON.parse(raw) as StateFile;
}

export function saveState(state: StateFile): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf-8");
  console.log(`[state] Saved state with ${state.posts.length} posts`);
}

/**
 * Returns feed items that haven't been fully published to all destinations,
 * respecting the max retry limit.
 */
export function getNewPosts(feedItems: FeedItem[]): {
  newItems: FeedItem[];
  state: StateFile;
} {
  const state = loadState();
  const existingGuids = new Set(state.posts.map((p) => p.beehiivGuid));

  const newItems: FeedItem[] = [];

  for (const item of feedItems) {
    // Brand new post — never seen before
    if (!existingGuids.has(item.guid)) {
      newItems.push(item);
      continue;
    }

    // Existing post — check if any destination needs retry
    const existing = state.posts.find((p) => p.beehiivGuid === item.guid);
    if (!existing) continue;

    const needsRetry = (Object.keys(existing.destinations) as DestinationName[]).some(
      (dest) => {
        const d = existing.destinations[dest];
        return d.status === "failed" && d.retryCount < MAX_RETRIES;
      }
    );

    if (needsRetry) {
      newItems.push(item);
    }
  }

  console.log(
    `[state] ${newItems.length} posts to process (new or retry) out of ${feedItems.length} feed items`
  );
  return { newItems, state };
}

/**
 * Record the result of a publish attempt for a specific destination.
 */
export function recordResult(
  state: StateFile,
  item: FeedItem,
  destination: DestinationName,
  result: Pick<DestinationResult, "status" | "url" | "postUrn" | "error">
): void {
  let post = state.posts.find((p) => p.beehiivGuid === item.guid);

  if (!post) {
    post = {
      beehiivGuid: item.guid,
      beehiivUrl: item.link,
      title: item.title,
      publishedAt: item.pubDate,
      destinations: {
        medium: { status: "skipped", retryCount: 0, lastAttempt: "" },
        substack: { status: "skipped", retryCount: 0, lastAttempt: "" },
        linkedin: { status: "skipped", retryCount: 0, lastAttempt: "" },
      },
    };
    state.posts.push(post);
  }

  const prev = post.destinations[destination];
  const retryCount =
    result.status === "failed" ? (prev?.retryCount ?? 0) + 1 : prev?.retryCount ?? 0;

  post.destinations[destination] = {
    status: result.status,
    url: result.url,
    postUrn: result.postUrn,
    error: result.error,
    retryCount,
    lastAttempt: new Date().toISOString(),
  };
}

/**
 * Check whether a specific destination needs publishing for a given post.
 */
export function needsPublish(
  state: StateFile,
  guid: string,
  destination: DestinationName
): boolean {
  const post = state.posts.find((p) => p.beehiivGuid === guid);
  if (!post) return true;

  const dest = post.destinations[destination];
  if (!dest || dest.status === "skipped") return true;
  if (dest.status === "success") return false;
  if (dest.status === "failed" && dest.retryCount < MAX_RETRIES) return true;

  return false;
}
