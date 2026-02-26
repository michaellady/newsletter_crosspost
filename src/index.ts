import { fetchFeed } from "./feed.js";
import { getNewPosts, needsPublish, recordResult, saveState } from "./state.js";
import {
  transformForMedium,
  transformForSubstack,
  transformForLinkedIn,
} from "./transform.js";
import { publishToMedium } from "./publishers/medium.js";
import { publishToSubstack } from "./publishers/substack.js";
import { publishToLinkedIn } from "./publishers/linkedin.js";
import { notifyFailure, notifySummary } from "./notify.js";
import type { DestinationName } from "./types.js";

async function main(): Promise<void> {
  const isDryRun = process.env.DRY_RUN === "true";

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Enterprise Vibe Code — Cross-Post Pipeline  ║");
  console.log(`║  Mode: ${isDryRun ? "DRY RUN 🏃" : "LIVE 🚀"}                              ║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  // Step 1: Fetch RSS feed
  const feedItems = await fetchFeed();

  if (feedItems.length === 0) {
    console.log("[main] No items in feed. Exiting.");
    return;
  }

  // Step 2: Determine new/retry posts
  const { newItems, state } = getNewPosts(feedItems);

  if (newItems.length === 0) {
    console.log("[main] No new posts to process. All caught up! ✨");
    return;
  }

  // Step 3: Process each new post
  for (const item of newItems) {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`📝 Processing: "${item.title}"`);
    console.log(`   Source: ${item.link}`);
    console.log(`${"─".repeat(50)}\n`);

    const results: Record<DestinationName, { status: string; url?: string }> = {
      medium: { status: "skipped" },
      substack: { status: "skipped" },
      linkedin: { status: "skipped" },
    };

    // --- Medium (API) ---
    if (needsPublish(state, item.guid, "medium")) {
      const payload = transformForMedium(item);
      const result = await publishToMedium(payload);
      recordResult(state, item, "medium", result);
      results.medium = { status: result.status, url: result.url };

      if (result.status === "failed") {
        await notifyFailure("medium", payload, result.error ?? "Unknown error");
      }
    } else {
      console.log("[main] Medium: already published or max retries reached");
    }

    // --- Substack (Playwright) ---
    if (needsPublish(state, item.guid, "substack")) {
      const payload = transformForSubstack(item);
      const result = await publishToSubstack(payload);
      recordResult(state, item, "substack", result);
      results.substack = { status: result.status, url: result.url };

      if (result.status === "failed") {
        await notifyFailure("substack", payload, result.error ?? "Unknown error");
      }
    } else {
      console.log("[main] Substack: already published or max retries reached");
    }

    // --- LinkedIn Newsletter (Playwright) ---
    if (needsPublish(state, item.guid, "linkedin")) {
      const payload = transformForLinkedIn(item);
      const result = await publishToLinkedIn(payload);
      recordResult(state, item, "linkedin", result);
      results.linkedin = { status: result.status, url: result.url };

      if (result.status === "failed") {
        await notifyFailure("linkedin", payload, result.error ?? "Unknown error");
      }
    } else {
      console.log("[main] LinkedIn: already published or max retries reached");
    }

    // Summary for this post
    await notifySummary(item.title, results);
  }

  // Step 4: Save state
  saveState(state);
  console.log("\n[main] Pipeline complete. ✅\n");
}

// Run
main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
