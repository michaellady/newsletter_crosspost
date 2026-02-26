import type { PublishPayload, DestinationResult } from "../types.js";

const MEDIUM_API = "https://api.medium.com/v1";

function getConfig() {
  const token = process.env.MEDIUM_TOKEN;
  const userId = process.env.MEDIUM_USER_ID;
  if (!token || !userId) {
    throw new Error(
      "[medium] Missing MEDIUM_TOKEN or MEDIUM_USER_ID env vars"
    );
  }
  return { token, userId };
}

/**
 * One-time helper: call GET /v1/me to retrieve your userId.
 * Run this once and store the result as MEDIUM_USER_ID secret.
 *
 *   MEDIUM_TOKEN=xxx npx tsx -e "import './src/publishers/medium'; console.log(await getMe())"
 */
export async function getMe(): Promise<Record<string, unknown>> {
  const { token } = getConfig();
  const res = await fetch(`${MEDIUM_API}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as { data: Record<string, unknown> };
  return data.data;
}

/**
 * Publish a post to Medium via their REST API.
 */
export async function publishToMedium(
  payload: PublishPayload
): Promise<Pick<DestinationResult, "status" | "url" | "error">> {
  const isDryRun = process.env.DRY_RUN === "true";
  const { token, userId } = getConfig();

  // Default tags — customize as needed
  const tags = ["devops", "ai", "vibe-coding", "software-engineering"];

  const body = {
    title: payload.title,
    contentFormat: "html",
    content: payload.htmlContent,
    canonicalUrl: payload.canonicalUrl,
    tags: tags.slice(0, 5), // Medium allows max 5 tags
    publishStatus: isDryRun ? "draft" : "public",
  };

  console.log(
    `[medium] Publishing "${payload.title}" (${isDryRun ? "DRAFT" : "PUBLIC"})...`
  );

  try {
    const res = await fetch(`${MEDIUM_API}/users/${userId}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[medium] API error ${res.status}: ${errText}`);
      return {
        status: "failed",
        error: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as {
      data: { id: string; url: string; canonicalUrl: string };
    };

    console.log(`[medium] ✅ Published: ${data.data.url}`);
    console.log(`[medium]    Canonical: ${data.data.canonicalUrl}`);

    return { status: "success", url: data.data.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[medium] ❌ Error: ${msg}`);
    return { status: "failed", error: msg };
  }
}
