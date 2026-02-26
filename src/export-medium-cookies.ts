/**
 * Interactive helper script to export Medium session cookies.
 *
 * This opens a real browser window where you manually log in to Medium.
 * After login, the cookies are exported as JSON for use in CI/CD.
 *
 * Usage:
 *   npx tsx src/export-medium-cookies.ts
 *
 * After running, copy the contents of medium-cookies.json into
 * your GitHub Actions secret named MEDIUM_COOKIES.
 */

import { exportCookies } from "./publishers/medium.js";

exportCookies().catch(console.error);
