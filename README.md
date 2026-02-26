# Enterprise Vibe Code — Cross-Post Pipeline

Automated content syndication from [enterprisevibecode.com](https://www.enterprisevibecode.com) (Beehiiv) to Medium, Substack, and LinkedIn Newsletter.

## How It Works

```
Beehiiv RSS → GitHub Actions (hourly cron) → Fan out to 3 destinations
```

| Destination        | Method              | Canonical URL | Notes                           |
|--------------------|---------------------|---------------|---------------------------------|
| **Medium**         | REST API            | ✅ Native      | Cleanest integration            |
| **Substack**       | Playwright (browser)| ⚠️ Footer link | No API exists                   |
| **LinkedIn Newsletter** | Playwright (browser) | ⚠️ Footer link | Newsletter API doesn't exist    |

State is tracked in `published.json` (committed to repo) to prevent duplicates and enable retries.

---

## Quick Start

### 1. Clone and install

```bash
git clone <your-repo-url>
cd enterprise-vibe-code-crosspost
npm install
npx playwright install chromium --with-deps
```

### 2. Configure secrets

Set these as [GitHub Actions secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets) in your repository:

#### Medium (API)
| Secret | How to get it |
|--------|---------------|
| `MEDIUM_TOKEN` | Medium → Settings → Security and Apps → Integration tokens → Generate |
| `MEDIUM_USER_ID` | Run: `curl -H "Authorization: Bearer YOUR_TOKEN" https://api.medium.com/v1/me` and copy the `id` field |

#### Substack (Playwright)
| Secret | How to get it |
|--------|---------------|
| `SUBSTACK_EMAIL` | Your Substack login email |
| `SUBSTACK_PASSWORD` | Your Substack password (enable password login in Substack settings) |

> **Note:** Substack primarily uses magic-link email login. To use password auth, go to your Substack account settings and set a password.

#### LinkedIn Newsletter (Playwright)

LinkedIn has aggressive bot detection. **Cookie-based auth is strongly recommended** over email/password.

| Secret | How to get it |
|--------|---------------|
| `LINKEDIN_COOKIES` | **(Preferred)** Run the cookie export helper (see below) |
| `LINKEDIN_EMAIL` | **(Fallback)** Your LinkedIn email |
| `LINKEDIN_PASSWORD` | **(Fallback)** Your LinkedIn password |
| `LINKEDIN_NEWSLETTER_URL` | Your newsletter URL, e.g. `https://www.linkedin.com/newsletters/your-newsletter-XXXXXXXXX/` |

**Exporting LinkedIn cookies:**

```bash
npx tsx src/export-linkedin-cookies.ts
```

This opens a browser window. Log in to LinkedIn manually, then press Enter in the terminal. Cookies are saved to `linkedin-cookies.json` — copy the contents into the `LINKEDIN_COOKIES` GitHub secret, then delete the local file.

> ⚠️ LinkedIn cookies expire. You'll need to re-export cookies periodically (roughly every 30-60 days). Set a calendar reminder.

#### Notifications (Optional)
| Secret | How to get it |
|--------|---------------|
| `SLACK_WEBHOOK_URL` | Create a [Slack incoming webhook](https://api.slack.com/messaging/webhooks) |

### 3. Verify your Beehiiv RSS feed

Open `https://www.enterprisevibecode.com/feed` in a browser. If it returns XML with your posts, you're good. If not, enable RSS in Beehiiv: Settings → Publication → RSS Feed → Generate Feed.

### 4. Test with a dry run

```bash
# Local dry run (drafts only, no publishing)
DRY_RUN=true \
MEDIUM_TOKEN=xxx \
MEDIUM_USER_ID=xxx \
SUBSTACK_EMAIL=xxx \
SUBSTACK_PASSWORD=xxx \
LINKEDIN_COOKIES='[...]' \
npx tsx src/index.ts
```

Or trigger a dry run via GitHub Actions: go to Actions → Cross-Post Newsletter → Run workflow → set `dry_run: true`.

### 5. Enable the cron

The workflow runs automatically every hour. After verifying with a dry run, it's ready to go.

---

## Project Structure

```
├── .github/workflows/
│   └── crosspost.yml          # GitHub Actions cron workflow
├── src/
│   ├── index.ts               # Main orchestrator
│   ├── feed.ts                # Beehiiv RSS parser
│   ├── transform.ts           # HTML cleaning + per-platform formatting
│   ├── state.ts               # published.json state management
│   ├── notify.ts              # Slack/console failure notifications
│   ├── types.ts               # TypeScript interfaces
│   ├── export-linkedin-cookies.ts  # Interactive cookie export helper
│   └── publishers/
│       ├── medium.ts          # Medium REST API client
│       ├── substack.ts        # Substack Playwright automation
│       └── linkedin.ts        # LinkedIn Playwright automation
├── published.json             # Syndication state (tracked in git)
├── package.json
└── tsconfig.json
```

---

## How Each Publisher Works

### Medium (API) ✅

Straightforward REST API call. Sends HTML content with `canonicalUrl` pointing back to Beehiiv. Google recognizes this canonical tag and attributes SEO value to your primary site.

### Substack (Playwright) 🎭

No API exists, so we automate the browser:

1. Launch headless Chromium
2. Log in with email/password
3. Navigate to the post editor (`/publish/post`)
4. Fill title via input field
5. Paste HTML content into ProseMirror editor via clipboard events
6. Click through the publish flow (selecting "web only" to avoid emailing subscribers)
7. Capture the published URL

**If automation fails:** A Slack/console notification is sent with the title, content, and a direct link to the Substack editor for manual paste.

### LinkedIn Newsletter (Playwright) 🎭

Also no API for newsletter editions, so browser automation:

1. Launch headless Chromium
2. Authenticate via cookies (preferred) or email/password
3. Navigate to the article editor (either via newsletter page or `/article/new/`)
4. If a newsletter selection dialog appears, select the correct newsletter
5. Type the title, paste HTML content into the editor
6. Click through the publish flow
7. Capture the published URL

**Cookie refresh:** LinkedIn sessions expire. Re-export cookies every 30-60 days using the helper script.

---

## Failure Handling

| Scenario | Behavior |
|----------|----------|
| One destination fails | Other destinations still publish. Failed destination retries on next run. |
| Max retries (3) exceeded | Destination marked as permanently failed for that post. Manual action needed. |
| Playwright selector broken | Error screenshot saved as GitHub Actions artifact for debugging. |
| RSS feed unreachable | Entire run skips gracefully. Next run retries. |
| All destinations succeed | State committed, summary logged. |

---

## Maintenance Checklist

| Task | Frequency | How |
|------|-----------|-----|
| Refresh LinkedIn cookies | Every 30-60 days | Run `npx tsx src/export-linkedin-cookies.ts` |
| Check GitHub Actions logs | Weekly | Review for failures or warnings |
| Update Playwright | Monthly | `npm update playwright` — UI changes may require selector updates |
| Verify Substack selectors | After Substack UI updates | Run a dry run and check the screenshot |

---

## Cost

**$0/month.** GitHub Actions free tier provides 2,000 minutes/month. Hourly runs use ~720 min/month.

---

## Future Enhancements

- [ ] Add Dev.to (has a great API with canonical URL support)
- [ ] Add Hashnode (API with canonical URLs)
- [ ] AI-generated platform-specific teasers via Claude API
- [ ] Engagement analytics aggregation dashboard
- [ ] LinkedIn token auto-refresh workflow
