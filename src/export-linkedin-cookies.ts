/**
 * Interactive helper script to export LinkedIn session cookies.
 *
 * This opens a real browser window where you manually log in to LinkedIn.
 * After login, the cookies are exported as JSON for use in CI/CD.
 *
 * Usage:
 *   npx tsx src/export-linkedin-cookies.ts
 *
 * After running, copy the contents of linkedin-cookies.json into
 * your GitHub Actions secret named LINKEDIN_COOKIES.
 */

import { exportCookies } from "./publishers/linkedin.js";

exportCookies().catch(console.error);
