import type { PublishPayload, DestinationName } from "./types.js";

/**
 * Send a failure notification so the user can manually publish.
 * Supports Slack webhook (optional — set SLACK_WEBHOOK_URL env var).
 * Falls back to console logging if no webhook is configured.
 */
export async function notifyFailure(
  destination: DestinationName,
  payload: PublishPayload,
  error: string
): Promise<void> {
  const message = buildFailureMessage(destination, payload, error);

  // Slack webhook notification
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    try {
      await fetch(slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `❌ Cross-post to ${destination} failed`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: [
                  `*Post:* ${payload.title}`,
                  `*Original:* ${payload.canonicalUrl}`,
                  `*Error:* \`${error.slice(0, 200)}\``,
                  "",
                  "_Manual action required — paste the content manually._",
                ].join("\n"),
              },
            },
          ],
        }),
      });
      console.log(`[notify] Slack notification sent for ${destination} failure`);
    } catch (err) {
      console.error(
        `[notify] Failed to send Slack notification: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // Always log to console (visible in GitHub Actions logs)
  console.log("\n" + "=".repeat(60));
  console.log(message);
  console.log("=".repeat(60) + "\n");
}

function buildFailureMessage(
  destination: DestinationName,
  payload: PublishPayload,
  error: string
): string {
  const manualUrls: Record<DestinationName, string> = {
    medium: "https://medium.com/new-story",
    substack:
      process.env.SUBSTACK_URL
        ? `${process.env.SUBSTACK_URL}/publish/post`
        : "https://substack.com/publish/post",
    linkedin: "https://www.linkedin.com/article/new/",
  };

  return [
    `CROSS-POST FAILED: ${destination.toUpperCase()}`,
    ``,
    `Post:     ${payload.title}`,
    `Original: ${payload.canonicalUrl}`,
    `Error:    ${error}`,
    ``,
    `Manual publish URL: ${manualUrls[destination]}`,
    ``,
    `Action: Open the URL above, paste the content, and publish manually.`,
  ].join("\n");
}

/**
 * Send a success summary after all destinations have been processed.
 */
export async function notifySummary(
  title: string,
  results: Record<DestinationName, { status: string; url?: string }>
): Promise<void> {
  const lines = Object.entries(results).map(([dest, r]) => {
    const icon = r.status === "success" ? "✅" : r.status === "failed" ? "❌" : "⏭️";
    return `  ${icon} ${dest}: ${r.status}${r.url ? ` → ${r.url}` : ""}`;
  });

  const summary = [
    `📝 Cross-post summary: "${title}"`,
    ...lines,
  ].join("\n");

  console.log("\n" + summary + "\n");

  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    try {
      await fetch(slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: summary }),
      });
    } catch {
      // Non-critical
    }
  }
}
