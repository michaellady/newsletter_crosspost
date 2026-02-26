import { chromium, type Browser, type Page } from "playwright";
import type { PublishPayload, DestinationResult } from "../types.js";

/**
 * Login to LinkedIn.
 *
 * NOTE: LinkedIn has aggressive bot detection. If you encounter CAPTCHA or
 * verification challenges, you have two options:
 *
 * 1. Cookie-based auth: Login manually in a real browser, export cookies,
 *    and inject them via context.addCookies(). This is more reliable.
 *
 * 2. If using email/password: Ensure you don't have 2FA enabled on the
 *    account used for automation, or handle the 2FA flow.
 */
async function login(page: Page): Promise<void> {
  const email = process.env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD;

  // Option 1: Cookie-based auth (preferred)
  const cookiesJson = process.env.LINKEDIN_COOKIES;
  if (cookiesJson) {
    console.log("[linkedin] Using cookie-based authentication...");
    const cookies = JSON.parse(cookiesJson);
    await page.context().addCookies(cookies);
    await page.goto("https://www.linkedin.com/feed/", {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(3000);

    // Verify we're logged in
    if (page.url().includes("/login") || page.url().includes("/authwall")) {
      throw new Error("[linkedin] Cookie auth failed — cookies may be expired");
    }
    console.log("[linkedin] ✅ Cookie auth successful");
    return;
  }

  // Option 2: Email/password login
  if (!email || !password) {
    throw new Error(
      "[linkedin] Missing auth credentials. Set LINKEDIN_COOKIES (preferred) " +
        "or both LINKEDIN_EMAIL and LINKEDIN_PASSWORD."
    );
  }

  console.log("[linkedin] Logging in with email/password...");

  await page.goto("https://www.linkedin.com/login", {
    waitUntil: "networkidle",
  });

  await page.locator("#username").fill(email);
  await page.locator("#password").fill(password);
  await page
    .locator('button[type="submit"], button:has-text("Sign in")')
    .first()
    .click();

  // Wait for redirect to feed
  await page.waitForURL(/linkedin\.com\/feed/, { timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check for verification challenge
  if (
    page.url().includes("checkpoint") ||
    page.url().includes("challenge")
  ) {
    throw new Error(
      "[linkedin] Verification challenge detected. Use cookie-based auth instead."
    );
  }

  console.log("[linkedin] ✅ Login successful");
}

/**
 * Publish a newsletter edition on LinkedIn using the article/newsletter editor.
 *
 * The LinkedIn Newsletter editor is accessed via the "Write article" flow
 * associated with your newsletter.
 */
async function createNewsletterPost(
  page: Page,
  payload: PublishPayload,
  isDryRun: boolean
): Promise<string | null> {
  const newsletterUrl = process.env.LINKEDIN_NEWSLETTER_URL;

  console.log("[linkedin] Navigating to article editor...");

  // If we have a specific newsletter URL, navigate to it to write a new edition
  // LinkedIn newsletter URLs look like:
  //   https://www.linkedin.com/newsletters/enterprise-vibe-code-XXXXXXXXX/
  // The "write" URL for a new article:
  //   https://www.linkedin.com/article/new/
  // Or specifically for a newsletter:
  //   Click "Write" from the newsletter page

  if (newsletterUrl) {
    // Navigate to the newsletter page and click "Write" to start a new edition
    await page.goto(newsletterUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Look for "Write" or "Create a new edition" button
    const writeBtn = page.locator(
      'button:has-text("Write"), a:has-text("Write"), button:has-text("new edition"), button:has-text("Create")'
    );
    if (await writeBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await writeBtn.first().click();
      await page.waitForTimeout(3000);
    } else {
      // Fallback: navigate to article creation directly
      await page.goto("https://www.linkedin.com/article/new/", {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
    }
  } else {
    // No newsletter URL provided — use generic article editor
    await page.goto("https://www.linkedin.com/article/new/", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
  }

  // --- If there's a newsletter selection modal, select the newsletter ---
  const newsletterSelect = page.locator(
    'text="Select a newsletter", text="Choose newsletter"'
  );
  if (await newsletterSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("[linkedin] Newsletter selection dialog detected...");
    // Click on the first newsletter option (assumes you have one newsletter)
    const firstNewsletter = page.locator(
      '.newsletter-option, [data-test-newsletter-option], li:has-text("Enterprise")'
    );
    if (
      await firstNewsletter.first().isVisible({ timeout: 3000 }).catch(() => false)
    ) {
      await firstNewsletter.first().click();
      await page.waitForTimeout(2000);
    }

    // Confirm selection
    const confirmBtn = page.locator(
      'button:has-text("Done"), button:has-text("Next"), button:has-text("Continue")'
    );
    if (await confirmBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.first().click();
      await page.waitForTimeout(2000);
    }
  }

  // --- Fill the title ---
  console.log("[linkedin] Setting title...");
  const titleField = page.locator(
    '[placeholder*="Title"], [placeholder*="Headline"], [role="textbox"]:first-of-type, .article-title, header [contenteditable="true"]'
  );
  await titleField.first().waitFor({ state: "visible", timeout: 15000 });
  await titleField.first().click();
  await page.keyboard.type(payload.title, { delay: 20 });
  await page.waitForTimeout(1000);

  // --- Fill the body ---
  console.log("[linkedin] Pasting content into editor...");

  // Move focus to the article body. LinkedIn uses a contenteditable div.
  // Tab from title to move to body, or click directly on the body area.
  const bodyArea = page.locator(
    '.article-editor__content [contenteditable="true"], .ql-editor, .article-body [contenteditable="true"], [data-placeholder*="Write"], [data-placeholder*="article"]'
  );

  if (await bodyArea.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await bodyArea.first().click();
  } else {
    // Fallback: press Tab to move from title to body
    await page.keyboard.press("Tab");
    await page.waitForTimeout(1000);
  }

  // Paste HTML content via clipboard
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
    // Target the active/focused element
    const target =
      document.activeElement ??
      document.querySelector('[contenteditable="true"]');
    target?.dispatchEvent(event);
  }, payload.htmlContent);

  await page.waitForTimeout(3000);

  if (isDryRun) {
    console.log("[linkedin] 🏃 DRY RUN — taking screenshot, not publishing");
    await page.screenshot({
      path: "linkedin-draft-preview.png",
      fullPage: false,
    });
    return null;
  }

  // --- Publish ---
  console.log("[linkedin] Publishing...");

  // Click the "Publish" or "Next" button
  const publishBtn = page.locator(
    'button:has-text("Publish"), button:has-text("Next")'
  );
  await publishBtn.first().waitFor({ state: "visible", timeout: 10000 });
  await publishBtn.first().click();
  await page.waitForTimeout(3000);

  // Handle the publish confirmation dialog if present
  // LinkedIn may ask about notifications to subscribers, etc.
  const confirmPublish = page.locator(
    'button:has-text("Publish"), button:has-text("Done"), button:has-text("Send")'
  );
  if (
    await confirmPublish
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)
  ) {
    await confirmPublish.first().click();
    await page.waitForTimeout(5000);
  }

  const currentUrl = page.url();
  console.log(`[linkedin] ✅ Published. Current URL: ${currentUrl}`);

  return currentUrl;
}

/**
 * Helper: Export cookies from a logged-in LinkedIn session.
 * Run this interactively to generate cookies for LINKEDIN_COOKIES env var.
 *
 * Usage:
 *   npx tsx src/publishers/linkedin-export-cookies.ts
 */
export async function exportCookies(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.linkedin.com/login");

  console.log(
    "\n🔐 Please log in to LinkedIn manually in the browser window."
  );
  console.log("   After logging in, press Enter in this terminal.\n");

  // Wait for user to press Enter
  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  const cookies = await context.cookies();
  const cookieJson = JSON.stringify(cookies);

  console.log("\n✅ Cookies exported. Set this as LINKEDIN_COOKIES secret:\n");
  console.log(cookieJson.slice(0, 200) + "...\n");
  console.log(`Full length: ${cookieJson.length} characters`);

  // Save to file for easy copy
  const { writeFileSync } = await import("node:fs");
  writeFileSync("linkedin-cookies.json", cookieJson);
  console.log("Saved to linkedin-cookies.json (add to GitHub Secrets, then delete this file)");

  await browser.close();
}

/**
 * Main entry point for LinkedIn Newsletter publishing.
 */
export async function publishToLinkedIn(
  payload: PublishPayload
): Promise<Pick<DestinationResult, "status" | "url" | "error">> {
  const isDryRun = process.env.DRY_RUN === "true";
  let browser: Browser | null = null;

  try {
    console.log(
      `[linkedin] Starting browser automation for "${payload.title}"...`
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
    const url = await createNewsletterPost(page, payload, isDryRun);

    await browser.close();
    browser = null;

    return {
      status: "success",
      url: url ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[linkedin] ❌ Browser automation failed: ${msg}`);

    // Screenshot for debugging
    if (browser) {
      try {
        const pages = browser.contexts()[0]?.pages();
        if (pages?.[0]) {
          await pages[0].screenshot({
            path: "linkedin-error-screenshot.png",
            fullPage: true,
          });
          console.log(
            "[linkedin] Saved error screenshot: linkedin-error-screenshot.png"
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
