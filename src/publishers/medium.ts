import { chromium, type Browser, type Page } from "playwright";
import type { PublishPayload, DestinationResult } from "../types.js";

/**
 * Login to Medium using cookie-based auth.
 *
 * Medium only supports Google OAuth, Apple, Facebook, or email magic-link —
 * none automatable in headless mode. Cookie injection is the only viable path.
 *
 * Export cookies with: npx tsx src/export-medium-cookies.ts
 */
async function login(page: Page): Promise<void> {
  const cookiesJson = process.env.MEDIUM_COOKIES;
  if (!cookiesJson) {
    throw new Error(
      "[medium] Missing MEDIUM_COOKIES env var. " +
        "Run `npx tsx src/export-medium-cookies.ts` to export cookies."
    );
  }

  console.log("[medium] Using cookie-based authentication...");
  const cookies = JSON.parse(cookiesJson);
  await page.context().addCookies(cookies);
  await page.goto("https://medium.com/", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(3000);

  // Verify we're logged in (not redirected to signin)
  if (
    page.url().includes("/m/signin") ||
    page.url().includes("medium.com/m/callback")
  ) {
    throw new Error(
      "[medium] Cookie auth failed — cookies may be expired. " +
        "Re-run `npx tsx src/export-medium-cookies.ts`."
    );
  }
  console.log("[medium] ✅ Cookie auth successful");
}

/**
 * Create and publish a new story on Medium using the web editor.
 */
async function createPost(
  page: Page,
  payload: PublishPayload,
  isDryRun: boolean
): Promise<string | null> {
  console.log("[medium] Navigating to new story editor...");

  await page.goto("https://medium.com/new-story", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // --- Fill the title ---
  console.log("[medium] Setting title...");
  const titleField = page.locator(
    'h3[data-testid="post-title"], [data-testid="post-title"], h3[contenteditable="true"], [role="textbox"][data-contents="true"]:first-of-type, [placeholder*="Title"], h3.graf--title'
  );
  await titleField.first().waitFor({ state: "visible", timeout: 15000 });
  await titleField.first().click();
  await page.keyboard.type(payload.title, { delay: 20 });
  await page.waitForTimeout(1000);

  // --- Fill the body ---
  console.log("[medium] Pasting content into editor...");

  // Move to the body area — press Enter from title to create body focus
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  // Paste HTML content via clipboard DataTransfer
  await page.evaluate((html) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/html", html);
    clipboardData.setData(
      "text/plain",
      html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
    );
    const event = new ClipboardEvent("paste", {
      clipboardData,
      bubbles: true,
      cancelable: true,
    });
    const target =
      document.activeElement ??
      document.querySelector('[contenteditable="true"]');
    target?.dispatchEvent(event);
  }, payload.htmlContent);

  await page.waitForTimeout(3000);

  if (isDryRun) {
    console.log("[medium] 🏃 DRY RUN — taking screenshot, not publishing");
    await page.screenshot({
      path: "medium-draft-preview.png",
      fullPage: false,
    });
    return null;
  }

  // --- Open publish dialog ---
  console.log("[medium] Opening publish dialog...");
  const publishBtn = page.locator(
    'button:has-text("Publish"), [data-testid="publish-button"], button:has-text("Ready to publish")'
  );
  await publishBtn.first().waitFor({ state: "visible", timeout: 10000 });
  await publishBtn.first().click();
  await page.waitForTimeout(3000);

  // --- Set tags (if configured) ---
  const tagsEnv = process.env.MEDIUM_TAGS;
  if (tagsEnv) {
    const tags = tagsEnv
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 5);
    console.log(`[medium] Adding tags: ${tags.join(", ")}`);

    const tagInput = page.locator(
      'input[placeholder*="tag"], input[placeholder*="Tag"], [data-testid="tag-input"] input'
    );
    if (await tagInput.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      for (const tag of tags) {
        await tagInput.first().fill(tag);
        await page.waitForTimeout(500);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);
      }
    }
  }

  // --- Set canonical URL in story settings if available ---
  if (payload.canonicalUrl) {
    console.log(
      `[medium] Setting canonical URL: ${payload.canonicalUrl}`
    );

    // Look for "More settings" or gear icon in the publish dialog
    const moreSettings = page.locator(
      'button:has-text("More settings"), button:has-text("Change"), text="More settings"'
    );
    if (
      await moreSettings.first().isVisible({ timeout: 3000 }).catch(() => false)
    ) {
      await moreSettings.first().click();
      await page.waitForTimeout(2000);

      const canonicalInput = page.locator(
        'input[placeholder*="canonical"], input[placeholder*="original"], input[name*="canonical"]'
      );
      if (
        await canonicalInput.first().isVisible({ timeout: 3000 }).catch(() => false)
      ) {
        await canonicalInput.first().fill(payload.canonicalUrl);
        await page.waitForTimeout(500);
      }
    }
  }

  // --- Confirm publish ---
  console.log("[medium] Clicking Publish now...");
  const confirmPublish = page.locator(
    'button:has-text("Publish now"), button[data-testid="publishButton"], button:has-text("Publish"):visible'
  );
  await confirmPublish.first().waitFor({ state: "visible", timeout: 10000 });
  await confirmPublish.first().click();

  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  console.log(`[medium] ✅ Published. Current URL: ${currentUrl}`);

  return currentUrl;
}

/**
 * Helper: Export cookies from a logged-in Medium session.
 * Run this interactively to generate cookies for MEDIUM_COOKIES env var.
 *
 * Usage:
 *   npx tsx src/export-medium-cookies.ts
 */
export async function exportCookies(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://medium.com/m/signin");

  console.log(
    "\n🔐 Please log in to Medium manually in the browser window."
  );
  console.log("   After logging in, press Enter in this terminal.\n");

  // Wait for user to press Enter
  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  const cookies = await context.cookies();
  const cookieJson = JSON.stringify(cookies);

  console.log("\n✅ Cookies exported. Set this as MEDIUM_COOKIES secret:\n");
  console.log(cookieJson.slice(0, 200) + "...\n");
  console.log(`Full length: ${cookieJson.length} characters`);

  // Save to file for easy copy
  const { writeFileSync } = await import("node:fs");
  writeFileSync("medium-cookies.json", cookieJson);
  console.log(
    "Saved to medium-cookies.json (add to GitHub Secrets, then delete this file)"
  );

  await browser.close();
}

/**
 * Main entry point for Medium publishing via Playwright.
 */
export async function publishToMedium(
  payload: PublishPayload
): Promise<Pick<DestinationResult, "status" | "url" | "error">> {
  const isDryRun = process.env.DRY_RUN === "true";
  let browser: Browser | null = null;

  try {
    console.log(
      `[medium] Starting browser automation for "${payload.title}"...`
    );

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Login
    await login(page);

    // Create and publish
    const url = await createPost(page, payload, isDryRun);

    await browser.close();
    browser = null;

    return {
      status: "success",
      url: url ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[medium] ❌ Browser automation failed: ${msg}`);

    // Screenshot for debugging
    if (browser) {
      try {
        const pages = browser.contexts()[0]?.pages();
        if (pages?.[0]) {
          await pages[0].screenshot({
            path: "medium-error-screenshot.png",
            fullPage: true,
          });
          console.log(
            "[medium] Saved error screenshot: medium-error-screenshot.png"
          );
        }
      } catch {
        // Ignore
      }
      await browser.close();
    }

    return { status: "failed", error: msg };
  }
}
