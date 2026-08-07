const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const REQUEST_TIMEOUT_MS = 10_000;
const SOCIAL_IMAGE_WIDTH = 1200;
const SOCIAL_IMAGE_HEIGHT = 630;
const DIAGNOSIS_QUESTION_COUNT = 48;

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
  { path: "/robots.txt", label: "robots.txt", includes: "Disallow: /compare" },
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

const assertNoIndex = (html, label) => {
  const robots = readMetaTags(html).get("robots") ?? "";
  if (!robots.includes("noindex") || !robots.includes("nofollow")) {
    throw new Error(`${label}にnoindex・nofollowがありません: ${robots || "<missing>"}`);
  }
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

const fetchPng = async (targetUrl, label) => {
  const response = await fetch(targetUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: "image/png"
    }
  });

  if (response.status !== 200) {
    throw new Error(`${label}がHTTP ${response.status}を返しました: ${targetUrl}`);
  }
  if (response.headers.get("content-type")?.split(";", 1)[0] !== "image/png") {
    throw new Error(`${label}のContent-Typeがimage/pngではありません。`);
  }

  assertSecurityHeaders(response, label);
  assertPngDimensions(Buffer.from(await response.arrayBuffer()), label);
  return response;
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
    await fetchPng(targetUrl, label);
    console.log(`OK ${label}: ${targetUrl}`);
  }
};

const createSmokeResultToken = (digit = "2") => {
  if (!/^[0-4]$/.test(digit)) {
    throw new Error("スモーク用回答値は0〜4の1文字で指定してください。");
  }

  const body = digit.repeat(DIAGNOSIS_QUESTION_COUNT);
  const value = body.split("").reduce((sum, char, index) => {
    return (sum + (char.charCodeAt(0) - 48) * (index + 3)) % 97;
  }, 0);

  return `v2_${body}_${String(value).padStart(2, "0")}`;
};

const assertResultCard = async (baseUrl) => {
  const encoded = createSmokeResultToken();
  const resultUrl = new URL(`/result?r=${encodeURIComponent(encoded)}`, `${baseUrl}/`);
  const resultResponse = await fetch(resultUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const html = await resultResponse.text();

  if (resultResponse.status !== 200) {
    throw new Error(`診断結果ページがHTTP ${resultResponse.status}を返しました: ${resultUrl}`);
  }
  if (!html.includes("画像を保存") || !html.includes("URLをコピー") || !html.includes("友だちと比較")) {
    throw new Error("診断結果ページに結果カード保存・コピー・友だち比較の導線がありません。");
  }
  assertSecurityHeaders(resultResponse, "診断結果ページ");

  const metadata = readMetaTags(html);
  if (metadata.get("twitter:card") !== "summary_large_image") {
    throw new Error("診断結果ページのtwitter:cardがsummary_large_imageではありません。");
  }

  const imageEntries = [
    ["診断結果OGP画像", metadata.get("og:image")],
    ["診断結果Xカード画像", metadata.get("twitter:image")]
  ];

  for (const altName of ["og:image:alt", "twitter:image:alt"]) {
    const alt = metadata.get(altName) ?? "";
    if (!alt.includes("診断結果") || !alt.includes("非公式ファン診断カード")) {
      throw new Error(`${altName}に診断結果カードの説明がありません。`);
    }
  }

  for (const [label, imageValue] of imageEntries) {
    if (!imageValue) {
      throw new Error(`${label}のメタデータがありません。`);
    }

    const metadataUrl = new URL(imageValue);
    if (metadataUrl.pathname !== "/api/result-card" || metadataUrl.searchParams.get("r") !== encoded) {
      throw new Error(`${label}が表示中の回答トークンを参照していません。`);
    }

    const targetUrl = new URL(`${metadataUrl.pathname}${metadataUrl.search}`, `${baseUrl}/`);
    const imageResponse = await fetchPng(targetUrl, label);
    const contentDisposition = imageResponse.headers.get("content-disposition") ?? "";
    const cacheControl = imageResponse.headers.get("cache-control") ?? "";

    if (!contentDisposition.startsWith("inline; filename=\"lol-playstyle-")) {
      throw new Error(`${label}のContent-Dispositionが不正です: ${contentDisposition || "<missing>"}`);
    }
    if (!cacheControl.includes("max-age=3600") || !cacheControl.includes("s-maxage=86400")) {
      throw new Error(`${label}のCache-Controlが期待値を満たしていません: ${cacheControl || "<missing>"}`);
    }

    console.log(`OK ${label}: ${targetUrl}`);
  }

  const invalidPaths = [
    "/api/result-card",
    "/api/result-card?r=v2_invalid_00",
    `/api/result-card?r=${encodeURIComponent(encoded)}&r=${encodeURIComponent(encoded)}`,
    `/api/result-card?r=${encodeURIComponent(encoded)}&theme=dark`
  ];

  for (const path of invalidPaths) {
    const targetUrl = new URL(path, `${baseUrl}/`);
    const response = await fetch(targetUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (response.status !== 400) {
      throw new Error(`不正な診断結果カードURLがHTTP ${response.status}を返しました: ${targetUrl}`);
    }
    if (response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
      throw new Error(`不正な診断結果カードURLのContent-Typeがapplication/jsonではありません: ${targetUrl}`);
    }
    if (response.headers.get("cache-control") !== "no-store") {
      throw new Error(`不正な診断結果カードURLがno-storeではありません: ${targetUrl}`);
    }
    assertSecurityHeaders(response, "不正な診断結果カードURL");
  }
};

const fetchHtmlPage = async (targetUrl, label) => {
  const response = await fetch(targetUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const html = await response.text();

  if (response.status !== 200) {
    throw new Error(`${label}がHTTP ${response.status}を返しました: ${targetUrl}`);
  }

  assertSecurityHeaders(response, label);
  return html;
};

const assertFriendComparison = async (baseUrl) => {
  const first = createSmokeResultToken("1");
  const second = createSmokeResultToken("3");

  const inviteUrl = new URL(`/compare?base=${encodeURIComponent(first)}`, `${baseUrl}/`);
  const inviteHtml = await fetchHtmlPage(inviteUrl, "友だち比較招待ページ");
  if (!inviteHtml.includes("友だち比較の招待") || !inviteHtml.includes("診断して比較する")) {
    throw new Error("友だち比較招待ページに招待内容と診断導線がありません。");
  }
  assertNoIndex(inviteHtml, "友だち比較招待ページ");
  console.log(`OK 友だち比較招待ページ: ${inviteUrl}`);

  const diagnosisUrl = new URL(`/diagnosis?compare=${encodeURIComponent(first)}`, `${baseUrl}/`);
  const diagnosisHtml = await fetchHtmlPage(diagnosisUrl, "比較モード診断ページ");
  if (!diagnosisHtml.includes("プレイスタイル診断")) {
    throw new Error("比較モード診断ページに診断UIがありません。");
  }
  console.log(`OK 比較モード診断ページ: ${diagnosisUrl}`);

  const continuationUrl = new URL(
    `/result?r=${encodeURIComponent(second)}&compare=${encodeURIComponent(first)}`,
    `${baseUrl}/`
  );
  const continuationHtml = await fetchHtmlPage(continuationUrl, "比較継続結果ページ");
  if (!continuationHtml.includes("比較結果の準備ができました") || !continuationHtml.includes("友だちとの比較結果を見る")) {
    throw new Error("比較継続結果ページに比較への導線がありません。");
  }
  assertNoIndex(continuationHtml, "比較継続結果ページ");
  console.log(`OK 比較継続結果ページ: ${continuationUrl}`);

  const comparisonUrl = new URL(
    `/compare?a=${encodeURIComponent(first)}&b=${encodeURIComponent(second)}`,
    `${baseUrl}/`
  );
  const comparisonHtml = await fetchHtmlPage(comparisonUrl, "友だち比較結果ページ");
  for (const expected of ["プレイ傾向の近さ", "8軸の比較", "近い軸", "違いが大きい軸", "おすすめロールの共通点"]) {
    if (!comparisonHtml.includes(expected)) {
      throw new Error(`友だち比較結果ページに${expected}がありません。`);
    }
  }
  if (comparisonHtml.includes("相性スコア")) {
    throw new Error("友だち比較結果ページが比較値を相性スコアとして表示しています。");
  }
  assertNoIndex(comparisonHtml, "友だち比較結果ページ");
  console.log(`OK 友だち比較結果ページ: ${comparisonUrl}`);

  const invalidPaths = [
    "/compare",
    "/compare?base=v2_invalid_00",
    `/compare?base=${encodeURIComponent(first)}&base=${encodeURIComponent(first)}`,
    `/compare?base=${encodeURIComponent(first)}&extra=1`,
    `/compare?a=${encodeURIComponent(first)}`,
    `/compare?a=${encodeURIComponent(first)}&b=${encodeURIComponent(second)}&extra=1`
  ];

  for (const path of invalidPaths) {
    const targetUrl = new URL(path, `${baseUrl}/`);
    const html = await fetchHtmlPage(targetUrl, "不正な友だち比較URL");
    if (!html.includes("診断結果を比較できませんでした")) {
      throw new Error(`不正な友だち比較URLでエラー表示されません: ${targetUrl}`);
    }
    assertNoIndex(html, "不正な友だち比較URL");
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
  await assertResultCard(baseUrl);
  await assertFriendComparison(baseUrl);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
