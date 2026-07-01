/**
 * Audit visuel, mobile et tunnel e-commerce de VoltCore.
 *
 * Exécution :
 *   NODE_PATH=<node_modules> node backend/scripts/seo_visual_audit.mjs \
 *     http://127.0.0.1:8050
 */
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(scriptDir, "../..");
const output = path.join(project, "docs", "seo-data", "visual");
const screenshots = path.join(output, "screenshots");
const base = (process.argv[2] || "http://127.0.0.1:8050").replace(/\/$/, "");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

await fs.mkdir(screenshots, { recursive: true });

const devices = [
  { name: "desktop", viewport: { width: 1440, height: 1000 }, mobile: false },
  { name: "mobile", viewport: { width: 390, height: 844 }, mobile: true },
];
const routes = [
  { slug: "accueil", path: "/" },
  { slug: "catalogue", path: "/catalogue" },
  { slug: "categorie-gpu", path: "/categorie/cartes-graphiques" },
  { slug: "produit", path: "/produit/1" },
  { slug: "configurateur", path: "/configurateur" },
  { slug: "contact", path: "/contact" },
  { slug: "404", path: "/__audit_page_absente__" },
];

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ["--disable-gpu", "--no-sandbox"],
});

const results = [];
const tunnel = {};

try {
  for (const device of devices) {
    const context = await browser.newContext({
      viewport: device.viewport,
      isMobile: device.mobile,
      hasTouch: device.mobile,
      deviceScaleFactor: 1,
      locale: "fr-FR",
    });
    await context.route("https://voltcore.fr/**", async (route) => {
      const remote = new URL(route.request().url());
      const localResponse = await context.request.get(
        `${base}${remote.pathname}${remote.search}`,
      );
      await route.fulfill({
        status: localResponse.status(),
        headers: localResponse.headers(),
        body: await localResponse.body(),
      });
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error)));
    page.on("requestfailed", (request) => {
      failedRequests.push(`${request.url()} — ${request.failure()?.errorText || "échec"}`);
    });

    for (const route of routes) {
      consoleErrors.length = 0;
      failedRequests.length = 0;
      const response = await page.goto(base + route.path, {
        waitUntil: "networkidle",
        timeout: 45_000,
      });
      await page.waitForTimeout(500);
      const metrics = await page.evaluate(() => {
        const visible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none"
            && rect.width > 0 && rect.height > 0;
        };
        const interactive = [...document.querySelectorAll("a,button,input,select,textarea")]
          .filter(visible);
        const unnamed = interactive.filter((element) => {
          const name = (
            element.getAttribute("aria-label")
            || element.getAttribute("title")
            || element.textContent
            || element.querySelector("img[alt]")?.getAttribute("alt")
            || element.getAttribute("placeholder")
            || ""
          ).trim();
          return !name;
        });
        const smallTargets = interactive.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        });
        const images = [...document.images];
        return {
          title: document.title,
          h1: [...document.querySelectorAll("h1")].map((node) => node.textContent.trim()),
          bodyTextWords: (document.body.innerText.match(/[\p{L}\p{N}]+/gu) || []).length,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          interactiveElements: interactive.length,
          unnamedInteractiveElements: unnamed.length,
          smallTouchTargets: smallTargets.length,
          imageCount: images.length,
          imagesMissingAlt: images.filter((image) => !image.hasAttribute("alt")).length,
          imagesMissingDimensions: images.filter(
            (image) => !image.getAttribute("width") || !image.getAttribute("height"),
          ).length,
          mainVisible: Boolean(document.querySelector("main,#app")),
        };
      });
      const screenshot = path.join(screenshots, `${device.name}-${route.slug}.png`);
      await page.evaluate(async () => {
        const step = Math.max(300, Math.floor(window.innerHeight * 0.75));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
        window.scrollTo(0, 0);
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({
        device: device.name,
        route: route.path,
        status: response?.status() ?? null,
        url: page.url(),
        screenshot: path.relative(project, screenshot).replaceAll("\\", "/"),
        consoleErrors: [...new Set(consoleErrors)],
        failedRequests: [...new Set(failedRequests)],
        ...metrics,
      });
    }

    if (device.name === "desktop") {
      const email = `audit-${Date.now()}@example.test`;
      const password = "AuditSeo-2026!";
      const registration = await context.request.post(`${base}/api/auth/register`, {
        data: { name: "Audit SEO", email, password },
      });
      const registrationData = await registration.json();
      tunnel.registrationStatus = registration.status();
      tunnel.verificationCodeExposedInAuditMode = Boolean(registrationData.dev_code);
      const verification = await context.request.post(`${base}/api/auth/verify`, {
        data: { email, code: registrationData.dev_code },
      });
      tunnel.verificationStatus = verification.status();
      const setCookie = verification.headers()["set-cookie"] || "";
      const sessionMatch = setCookie.match(/volt_session=([^;]+)/);
      if (sessionMatch) {
        await context.addCookies([
          { name: "volt_session", value: sessionMatch[1], url: base },
        ]);
      }
      tunnel.sessionCookieInstalled = Boolean(sessionMatch);
      await page.addInitScript(
        ({ auditEmail }) => {
          localStorage.setItem(
            "volt_user",
            JSON.stringify({ name: "Audit SEO", email: auditEmail }),
          );
        },
        { auditEmail: email },
      );

      await page.goto(base + "/produit/1", { waitUntil: "networkidle" });
      await page.locator("#buyBtn").click();
      tunnel.unexpectedAuthOnAdd = await page.locator("#authModal").isVisible();
      if (tunnel.unexpectedAuthOnAdd) {
        await page.locator("#authClose").click();
      }
      await page.waitForTimeout(750);
      if (!(await page.locator("#cartDrawer.open").isVisible().catch(() => false))) {
        await page.locator("#cartBtn").click();
      }
      tunnel.productAdded = await page.locator("#cartDrawer.open").isVisible();
      tunnel.checkoutButtonVisible = await page.locator("#checkoutBtn").isVisible().catch(() => false);
      if (!tunnel.checkoutButtonVisible) {
        const cartSetup = await context.request.put(`${base}/api/cart`, {
          data: { items: [{ product_id: 1, quantity: 1 }] },
        });
        tunnel.cartApiFallbackStatus = cartSetup.status();
        await page.goto(base + "/produit/1", { waitUntil: "networkidle" });
        await page.locator("#cartBtn").click();
        tunnel.checkoutButtonVisible = await page.locator("#checkoutBtn").isVisible().catch(() => false);
      }
      if (tunnel.checkoutButtonVisible) {
        await page.locator("#checkoutBtn").click();
        await page.waitForURL((url) => url.pathname === "/commande", { timeout: 10_000 });
        tunnel.checkoutReached = await page.locator("#checkoutForm").isVisible();
      } else {
        tunnel.checkoutReached = false;
      }
      tunnel.authenticationRequired = await page.locator("#authModal").isVisible();
      tunnel.cartCount = await page.locator("#cartCount").textContent().catch(() => null);
      await page.screenshot({
        path: path.join(screenshots, "desktop-tunnel-checkout.png"),
        fullPage: true,
      });
      const cleanup = await context.request.delete(`${base}/api/auth/account`, {
        data: { password },
      });
      tunnel.auditAccountCleanupStatus = cleanup.status();
    }

    await context.close();
  }
} finally {
  await browser.close();
}

const summary = {
  pagesTested: results.length,
  non200: results.filter((item) => item.status !== 200).length,
  horizontalOverflow: results.filter((item) => item.horizontalOverflow).length,
  pagesWithConsoleErrors: results.filter((item) => item.consoleErrors.length).length,
  pagesWithUnnamedControls: results.filter(
    (item) => item.unnamedInteractiveElements > 0,
  ).length,
  pagesWithSmallTargets: results.filter((item) => item.smallTouchTargets > 0).length,
};

const payload = { base, summary, tunnel, results };
await fs.writeFile(
  path.join(output, "visual-audit.json"),
  JSON.stringify(payload, null, 2),
  "utf8",
);

const lines = [
  "# Audit visuel et mobile VoltCore",
  "",
  `- Pages et variantes testées : **${summary.pagesTested}**`,
  `- Réponses non-200 : **${summary.non200}**`,
  `- Débordements horizontaux : **${summary.horizontalOverflow}**`,
  `- Pages avec erreur console : **${summary.pagesWithConsoleErrors}**`,
  `- Pages avec contrôles sans nom : **${summary.pagesWithUnnamedControls}**`,
  `- Pages avec petites cibles tactiles : **${summary.pagesWithSmallTargets}**`,
  "",
  "## Tunnel e-commerce",
  "",
  `- Produit ajouté au panier : **${Boolean(tunnel.productAdded)}**`,
  `- Bouton de commande visible : **${Boolean(tunnel.checkoutButtonVisible)}**`,
  `- Checkout authentifié atteint : **${Boolean(tunnel.checkoutReached)}**`,
  `- Compte de test supprimé : **${tunnel.auditAccountCleanupStatus === 200}**`,
  "",
  "## Pages contrôlées",
  "",
  "| Appareil | Route | HTTP | H1 | Débordement | Erreurs console | Petites cibles |",
  "|---|---|---:|---:|---|---:|---:|",
];
for (const item of results) {
  lines.push(
    `| ${item.device} | ${item.route} | ${item.status} | ${item.h1.length} | `
    + `${item.horizontalOverflow ? "oui" : "non"} | ${item.consoleErrors.length} | `
    + `${item.smallTouchTargets} |`,
  );
}
lines.push("", "Les captures sont disponibles dans `docs/seo-data/visual/screenshots/`.", "");
await fs.writeFile(path.join(output, "VISUAL-AUDIT.md"), lines.join("\n"), "utf8");

console.log(JSON.stringify({ summary, tunnel }));
