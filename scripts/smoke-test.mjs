const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const REQUEST_TIMEOUT_MS = 10_000;

const normalizeBaseUrl = (value) => {
  const candidate = value?.trim() || DEFAULT_BASE_URL;
  const url = new URL(candidate);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SMOKE_BASE_URLにはhttpまたはhttpsのURLを指定してください。");
  }

  return url.origin;
};

const checks = [
  { path: "/", label: "トップページ" },
  { path: "/diagnosis", label: "診断ページ" },
  { path: "/api/health", label: "ヘルスチェック", includes: '"status":"ok"' },
  { path: "/robots.txt", label: "robots.txt", includes: "Disallow: /result" },
  { path: "/sitemap.xml", label: "sitemap.xml", includes: "/diagnosis" }
];

const expectedSecurityHeaders = [
  ["content-security-policy", "base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'"],
  ["x-frame-options", "DENY"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["strict-transport-security", "max-age=31536000"],
  ["x-permitted-cross-domain-policies", "none"]
];

const assertSecurityHeaders = (response, label) => {
  for (const [name, expectedValue] of expectedSecurityHeaders) {
    const actualValue = response.headers.get(name);
    if (actualValue !== expectedValue) {
      throw new Error(
        `${label}の${name}が期待値と一致しません。expected=${expectedValue}, actual=${actualValue ?? "<missing>"}`
      );
    }
  }

  const permissionsPolicy = response.headers.get("permissions-policy") ?? "";
  for (const directive of ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()"] ) {
    if (!permissionsPolicy.includes(directive)) {
      throw new Error(`${label}のPermissions-Policyに${directive}がありません。`);
    }
  }

  if (response.headers.has("x-powered-by")) {
    throw new Error(`${label}でX-Powered-Byが公開されています。`);
  }
};

const run = async () => {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL);

  for (const check of checks) {
    const targetUrl = new URL(check.path, `${baseUrl}/`);
    const response = await fetch(targetUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const body = await response.text();

    if (response.status !== 200) {
      throw new Error(`${check.label}がHTTP ${response.status}を返しました: ${targetUrl}`);
    }

    if (check.includes && !body.includes(check.includes)) {
      throw new Error(`${check.label}の応答に期待する内容がありません: ${check.includes}`);
    }

    assertSecurityHeaders(response, check.label);
    console.log(`OK ${check.label}: ${targetUrl}`);
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
