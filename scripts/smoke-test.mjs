const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const REQUEST_TIMEOUT_MS = 10_000;
const SOCIAL_IMAGE_WIDTH = 1200;
const SOCIAL_IMAGE_HEIGHT = 630;

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
  { path: "/history", label: "診断履歴ページ", includes: "端末内の履歴" },
  { path: "/api/health", label: "ヘルスチェック", includes: '"status":"ok"' },
  { path: "/robots.txt", label: "robots.txt", includes: "Disallow: /history" },
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

const decodeHtmlAttribute = (value) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'");

const readMetaTags = (html) => {
  const metadata = new Map();

  for (const tagMatch of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map();
    for (const attributeMatch of tagMatch[0].matchAll(/([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(["'])(.*?)\2/g)) {
      attributes.set(attributeMatch[1].toLowerCase(), decodeHtmlAttribute(attributeMatch[3]));
    }

    const key = attributes.get("property") ?? attributes.get("name");
    const content = attributes.get("content");
    if (key && content && !metadata.has(key.toLowerCase())) {
      metadata.set(key.toLowerCase(), content);
    }
  }

  return metadata;
};

const assertPngDimensions = (buffer, label) => {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`${label}が有効なPNGではありません。`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== SOCIAL_IMAGE_WIDTH || height !== SOCIAL_IMAGE_HEIGHT) {
    throw new Error(
      `${label}の寸法が不正です。expected=${SOCIAL_IMAGE_WIDTH}x${SOCIAL_IMAGE_HEIGHT}, actual=${width}x${height}`
    );
  }
};

const assertSocialPreview = async (html, baseUrl) => {
  const metadata = readMetaTags(html);
  const requiredMetadata = [
    ["twitter:card", "summary_large_image"],
    ["og:image", null],
    ["og:image:alt", null],
    ["twitter:image", null],
    ["twitter:image:alt", null]
  ];

  for (const [name, expectedValue] of requiredMetadata) {
    const actualValue = metadata.get(name);
    if (!actualValue) {
      throw new Error(`トップページに${name}がありません。`);
    }
    if (expectedValue && actualValue !== expectedValue) {
      throw new Error(`${name}が期待値と一致しません。expected=${expectedValue}, actual=${actualValue}`);
    }
  }

  for (const altName of ["og:image:alt", "twitter:image:alt"]) {
    const alt = metadata.get(altName) ?? "";
    for (const keyword of ["48問", "8軸分析", "非公式"]) {
      if (!alt.includes(keyword)) {
        throw new Error(`${altName}に${keyword}がありません。`);
      }
    }
  }

  const imageEntries = [
    ["OGP画像", metadata.get("og:image")],
    ["Xカード画像", metadata.get("twitter:image")]
  ];

  for (const [label, imageValue] of imageEntries) {
    const metadataUrl = new URL(imageValue);
    if (metadataUrl.protocol !== "http:" && metadataUrl.protocol !== "https:") {
      throw new Error(`${label}のURL形式が不正です。`);
    }

    const targetUrl = new URL(`${metadataUrl.pathname}${metadataUrl.search}`, `${baseUrl}/`);
    const response = await fetch(targetUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (response.status !== 200) {
      throw new Error(`${label}がHTTP ${response.status}を返しました: ${targetUrl}`);
    }
    if (response.headers.get("content-type")?.split(";", 1)[0] !== "image/png") {
      throw new Error(`${label}のContent-Typeがimage/pngではありません。`);
    }

    assertSecurityHeaders(response, label);
    assertPngDimensions(Buffer.from(await response.arrayBuffer()), label);
    console.log(`OK ${label}: ${targetUrl}`);
  }
};

const run = async () => {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL);
  let topPageHtml = "";

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

    if (check.path === "/") {
      topPageHtml = body;
    }

    assertSecurityHeaders(response, check.label);
    console.log(`OK ${check.label}: ${targetUrl}`);
  }

  await assertSocialPreview(topPageHtml, baseUrl);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
