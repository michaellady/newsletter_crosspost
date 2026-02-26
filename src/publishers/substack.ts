import { chromium, type Browser, type Page } from "playwright";
import type { PublishPayload, DestinationResult } from "../types.js";

const SUBSTACK_BASE =
  process.env.SUBSTACK_URL ?? "https://enterprisevibecode.substack.com";

/**
 * Login to Substack via email/password.
 * Substack uses a magic-link flow by default, but also supports password login.
 */
async function login(page: Page): Promise<void> {
  const email = process.env.SUBSTACK_EMAIL;
  const password = process.env.SUBSTACK_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "[substack] Missing SUBSTACK_EMAIL or SUBSTACK_PASSWORD env vars"
    );
  }

  console.log("[substack] Logging in...");

  await page.goto("https://substack.com/sign-in", {
    waitUntil: "networkidle",
  });

  // Click "Sign in with password" if the option exists
  const passwordToggle = page.getByText("Sign in with password");
  if (await passwordToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
    await passwordToggle.click();
    await page.waitForTimeout(1000);
  }

  // Fill email
  const emailInput = page.locator('input[type="email"], input[name="email"]');
  await emailInput.waitFor({ state: "visible", timeout: 10000 });
  await emailInput.fill(email);

  // Fill password
  const passwordInput = page.locator(
    'input[type="password"], input[name="password"]'
  );
  await passwordInput.waitFor({ state: "visible", timeout: 10000 });
  await passwordInput.fill(password);

  // Submit
  const submitButton = page.locator(
    'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")'
  );
  await submitButton.first().click();

  // Wait for navigation to dashboard
  await page.waitForURL(/substack\.com/, { timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log("[substack] ✅ Login successful");
}

/**
 * Create and publish a new post on Substack using the web editor.
 */
async function createPost(
  page: Page,
  payload: PublishPayload,
  isDryRun: boolean
): Promise<string | null> {
  console.log(`[substack] Navigating to post editor...`);

  // Navigate to the new post editor
  await page.goto(`${SUBSTACK_BASE}/publish/post`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // --- Fill the title ---
  console.log("[substack] Setting title...");
  const titleField = page.locator(
    '[placeholder="Title"], [role="textbox"]:first-of-type, .post-title textarea, textarea'
  );
  await titleField.first().waitFor({ state: "visible", timeout: 15000 });
  await titleField.first().click();
  await titleField.first().fill(payload.title);
  await page.waitForTimeout(1000);

  // --- Fill the subtitle/description ---
  const subtitleField = page.locator(
    '[placeholder="Write a subtitle..."], [placeholder="Subtitle"]'
  );
  if (await subtitleField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await subtitleField.fill(payload.description.slice(0, 250));
    await page.waitForTimeout(500);
  }

  // --- Fill the body ---
  console.log("[substack] Pasting content into editor...");

  // Substack uses a ProseMirror-based editor. We paste HTML via clipboard.
  const editorBody = page.locator(
    '.ProseMirror, [contenteditable="true"], .tiptap'
  );
  await editorBody.first().waitFor({ state: "visible", timeout: 15000 });
  await editorBody.first().click();

  // Use clipboard to paste formatted HTML content
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
    const editor = document.querySelector(
      '.ProseMirror, [contenteditable="true"], .tiptap'
    );
    editor?.dispatchEvent(event);
  }, payload.htmlContent);

  await page.waitForTimeout(3000);

  if (isDryRun) {
    console.log("[substack] 🏃 DRY RUN — skipping publish, saving as draft");
    // Take a screenshot for verification
    await page.screenshot({
      path: "substack-draft-preview.png",
      fullPage: false,
    });
    return null;
  }

  // --- Publish the post ---
  console.log("[substack] Publishing post...");

  // Look for "Continue" or "Publish" button to open the publish dialog
  const continueBtn = page.locator(
    'button:has-text("Continue"), button:has-text("Publish"), button:has-text("Ready to send")'
  );
  await continueBtn.first().waitFor({ state: "visible", timeout: 10000 });
  await continueBtn.first().click();
  await page.waitForTimeout(2000);

  // In the publish dialog, select "Publish" (not "Send to email subscribers")
  // Look for a "web only" or similar option to avoid emailing subscribers
  const webOnlyOption = page.locator(
    'text="Publish on web only", text="Web only", label:has-text("web only")'
  );
  if (await webOnlyOption.isVisible({ timeout: 3000 }).catch(() => false)) {
    await webOnlyOption.click();
    await page.waitForTimeout(1000);
  }

  // Final publish button
  const publishConfirm = page.locator(
    'button:has-text("Publish now"), button:has-text("Publish"):not(:has-text("Publish on"))'
  );
  await publishConfirm.first().waitFor({ state: "visible", timeout: 10000 });
  await publishConfirm.first().click();

  // Wait for publish to complete
  await page.waitForTimeout(5000);

  // Try to capture the published URL
  const currentUrl = page.url();
  console.log(`[substack] ✅ Published. Current URL: ${currentUrl}`);

  return currentUrl;
}

/**
 * Main entry point for Substack publishing.
 */
export async function publishToSubstack(
  payload: PublishPayload
): Promise<Pick<DestinationResult, "status" | "url" | "error">> {
  const isDryRun = process.env.DRY_RUN === "true";
  let browser: Browser | null = null;

  try {
    console.log(`[substack] Starting browser automation for "${payload.title}"...`);

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Login
    await login(page);

    // Create and publish the post
    const url = await createPost(page, payload, isDryRun);

    await browser.close();
    browser = null;

    return {
      status: "success",
      url: url ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[substack] ❌ Browser automation failed: ${msg}`);

    // Take a screenshot for debugging if possible
    if (browser) {
      try {
        const pages = browser.contexts()[0]?.pages();
        if (pages?.[0]) {
          await pages[0].screenshot({
            path: "substack-error-screenshot.png",
            fullPage: true,
          });
          console.log("[substack] Saved error screenshot: substack-error-screenshot.png");
        }
      } catch {
        // Ignore screenshot failures
      }
      await browser.close();
    }

    return { status: "failed", error: msg };
  }
}
