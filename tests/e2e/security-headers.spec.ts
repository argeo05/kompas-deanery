import { expect, test } from "@playwright/test";

// Заголовки безопасности (SPEC §9.6, C1): три страницы — главная, 404 и защищённый /staff/*.
// Сервер — production-сборка за «прокси» (TRUSTED_PROXY, playwright.config.ts).

const PAGES = ["/", "/no-such-page", "/staff/requests"];

for (const path of PAGES) {
  test(`${path}: заголовки безопасности и CSP с nonce`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();

    expect(h["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["x-frame-options"]).toBe("DENY");

    const csp = h["content-security-policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]{20,}'/);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });
}

test("nonce меняется от запроса к запросу и совпадает с nonce в разметке", async ({ request }) => {
  const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)![1];
  const a = await request.get("/");
  const b = await request.get("/");
  const nonceA = nonceOf(a.headers()["content-security-policy"]);
  expect(nonceA).not.toBe(nonceOf(b.headers()["content-security-policy"]));
  expect(await a.text()).toContain(`nonce="${nonceA}"`);
});

test("страница гидратируется без нарушений CSP", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/content security policy/i.test(m.text())) violations.push(m.text());
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Next кладёт в window.next / __next_f только после выполнения своих скриптов.
  expect(await page.evaluate(() => Array.isArray((self as { __next_f?: unknown }).__next_f))).toBe(
    true,
  );
  expect(violations).toEqual([]);
});

test("cookie сессии в production: __Host-, HttpOnly, Secure, SameSite=Lax", async ({
  request,
  baseURL,
}) => {
  const res = await request.post("/api/auth/sign-in/username", {
    data: { username: "anna.demo", password: "kompas-demo-anna" },
    headers: { origin: baseURL!, "x-real-ip": `198.51.100.${Math.floor(Math.random() * 200) + 1}` },
  });
  expect(res.status()).toBe(200);
  const cookie = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value)
    .find((v) => v.includes("session_token"))!;
  expect(cookie).toMatch(/^__Host-kompas\.session_token=/);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/Secure/i);
  expect(cookie).toMatch(/SameSite=Lax/i);
  expect(cookie).toMatch(/Path=\//);
  expect(cookie).not.toMatch(/Domain=/i);
});
