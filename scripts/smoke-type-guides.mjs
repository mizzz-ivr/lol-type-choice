const REQUEST_TIMEOUT_MS = 10_000;

const normalizeBaseUrl = (value) => {
  const candidate = value?.trim();
  if (!candidate) {
    throw new Error("SMOKE_BASE_URLが指定されていません。");
  }

  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SMOKE_BASE_URLにはhttpまたはhttpsのURLを指定してください。");
  }

  return url.origin;
};

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
      throw new Error(`${label}の${name}が期待値と一致しません。expected=${expectedValue}, actual=${actualValue ?? "<missing>"}`);
    }
  }

  if (response.headers.has("x-powered-by")) {
    throw new Error(`${label}でX-Powered-Byが公開されています。`);
  }
};

const fetchHtml = async (url, label, expectedStatus = 200) => {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const body = await response.text();

  if (response.status !== expectedStatus) {
    throw new Error(`${label}がHTTP ${response.status}を返しました。expected=${expectedStatus}, url=${url}`);
  }

  assertSecurityHeaders(response, label);
  return body;
};

const readTypePathsFromSitemap = (xml, baseUrl) => {
  const paths = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)]
    .map((match) => new URL(match[1]).pathname)
    .filter((path) => path.startsWith("/types/") && path !== "/types/");

  const uniquePaths = [...new Set(paths)];
  if (!xml.includes(`${baseUrl}/types`) && !xml.includes("/types</loc>")) {
    throw new Error("sitemap.xmlに/typesがありません。");
  }
  if (uniquePaths.length !== 8) {
    throw new Error(`sitemap.xmlのタイプ詳細ページが8件ではありません。actual=${uniquePaths.length}`);
  }

  return uniquePaths;
};

const run = async () => {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL);

  const typesUrl = new URL("/types", `${baseUrl}/`);
  const typesHtml = await fetchHtml(typesUrl, "タイプ一覧ページ");
  if (!typesHtml.includes("8つのプレイスタイルタイプ") || !typesHtml.includes("自分のタイプを診断する")) {
    throw new Error("タイプ一覧ページに一覧説明または診断導線がありません。");
  }
  if (/name=["']robots["'][^>]*noindex/i.test(typesHtml)) {
    throw new Error("タイプ一覧ページがnoindexになっています。");
  }
  console.log(`OK タイプ一覧ページ: ${typesUrl}`);

  const sitemapUrl = new URL("/sitemap.xml", `${baseUrl}/`);
  const sitemapResponse = await fetch(sitemapUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const sitemapXml = await sitemapResponse.text();
  if (sitemapResponse.status !== 200) {
    throw new Error(`sitemap.xmlがHTTP ${sitemapResponse.status}を返しました。`);
  }
  assertSecurityHeaders(sitemapResponse, "sitemap.xml");

  const typePaths = readTypePathsFromSitemap(sitemapXml, baseUrl);
  for (const path of typePaths) {
    const targetUrl = new URL(path, `${baseUrl}/`);
    const html = await fetchHtml(targetUrl, `タイプ詳細ページ ${path}`);

    for (const expectedText of ["得意を出しやすい状況", "崩れやすい状況", "3段階の練習メニュー", "試合後の振り返り質問"]) {
      if (!html.includes(expectedText)) {
        throw new Error(`${path}に必須コンテンツがありません: ${expectedText}`);
      }
    }
    if (/name=["']robots["'][^>]*noindex/i.test(html)) {
      throw new Error(`${path}がnoindexになっています。`);
    }

    console.log(`OK タイプ詳細ページ: ${targetUrl}`);
  }

  const invalidUrl = new URL("/types/not-a-real-type", `${baseUrl}/`);
  await fetchHtml(invalidUrl, "不正タイプID", 404);
  console.log(`OK 不正タイプIDは404: ${invalidUrl}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
