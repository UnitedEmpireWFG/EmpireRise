// backend/smoke/smoke_frontend.mjs
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const ORIGIN = process.env.ORIGIN_APP || "";
const EMAIL  = process.env.TEST_EMAIL || "";
const PASS   = process.env.TEST_PASSWORD || "";

if (!ORIGIN) {
  console.error("FE smoke failed: ORIGIN_APP env var not set.");
  process.exit(1);
}

const outDir = path.resolve("./smoke");
await fs.mkdir(outDir, { recursive: true }).catch(() => {});

const saveArtifacts = async (page, tag) => {
  try {
    const png = path.join(outDir, `fe_${tag}.png`);
    const html = path.join(outDir, `fe_${tag}.html`);
    await page.screenshot({ path: png, fullPage: true });
    const body = await page.content();
    await fs.writeFile(html, body, "utf-8");
    console.log(`Saved artifacts: ${png}  ${html}`);
  } catch {}
};

// Generic helpers
const byEmail = (page) =>
  page.locator(
    [
      'input[type="email"]',
      'input[name="email"]',
      'input[autocomplete="username"]',
      'input[inputmode="email"]',
    ].join(", ")
  );

const byPassword = (page) =>
  page.locator(
    [
      'input[type="password"]',
      'input[name="password"]',
      'input[autocomplete="current-password"]',
    ].join(", ")
  );

const byLoginButton = (page) =>
  page.locator(
    [
      // your current form is an <input type=submit value="Sign in">
      'input[type="submit"][value="Sign in"]',
      'input[type="submit"][value="Sign In"]',
      // just in case:
      'button:has-text("Sign In")',
      'button:has-text("Sign in")',
      'button:has-text("Login")',
      'button:has-text("LOG IN")',
    ].join(", ")
  ).first();

const looksLoggedIn = async (page) => {
  // Any of these indicate the app shell loaded post-login
  const hints = [
    page.locator('a:has-text("DASHBOARD")'),
    page.locator('button:has-text("LOGOUT")'),
    page.locator('a[href="/"]'),
  ];
  for (const h of hints) {
    if ((await h.count().catch(() => 0)) > 0) return true;
  }
  // fallback: not on /login route anymore
  const url = page.url();
  if (!/\/login\b/i.test(url)) return true;
  return false;
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 800 },
  });
  const page = await ctx.newPage();

  try {
    console.log(`FE smoke @ ${ORIGIN}`);

    // 1) Go to app
    await page.goto(ORIGIN, { waitUntil: "domcontentloaded", timeout: 45000 });

    // If already logged in (cached session), short-circuit
    if (await looksLoggedIn(page)) {
      console.log("FE smoke: already logged in (session present). ✅");
      await browser.close();
      process.exit(0);
    }

    // 2) Go to /login if needed
    if (!/\/login\b/i.test(page.url())) {
      await page.goto(`${ORIGIN}/login`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    }

    // 3) Fill credentials
    if (!EMAIL || !PASS) {
      console.error(
        "FE smoke failed: TEST_EMAIL and/or TEST_PASSWORD not set in env."
      );
      await saveArtifacts(page, "missing_env");
      process.exit(1);
    }

    const emailInput = byEmail(page);
    const passInput = byPassword(page);

    await emailInput.first().fill(EMAIL, { timeout: 8000 });
    await passInput.first().fill(PASS, { timeout: 8000 });

    // 4) Click the submit button (covers Sign in/Login cases)
    const loginBtn = byLoginButton(page);
    await loginBtn.click({ timeout: 10000 });

    // 5) Wait for app shell after login
    await page.waitForLoadState("domcontentloaded", { timeout: 20000 });

    // Either the URL changed away from /login, or we see DASHBOARD/LOGOUT
    const ok = await looksLoggedIn(page);
    if (!ok) {
      await saveArtifacts(page, "no_dashboard");
      throw new Error("Login did not reach dashboard.");
    }

    console.log("FE smoke: login → dashboard ✅");
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error("FE smoke failed:", e.message || e);
    await saveArtifacts(page, "error");
    await browser.close();
    process.exit(1);
  }
})();