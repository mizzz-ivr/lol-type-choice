import { isIP } from "node:net";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

export const DEFAULT_HEALTH_TARGETS = [
  {
    name: "トップページ",
    path: "/",
    validate: async (response) => {
      const body = await response.text();
      return body.includes("LoL Playstyle Type Finder")
        ? null
        : "ページ識別文字列が見つかりません。";
    }
  },
  {
    name: "ヘルスチェック",
    path: "/api/health",
    validate: async (response) => {
      try {
        const body = await response.json();
        return body?.status === "ok"
          ? null
          : "ヘルスチェックのstatusがokではありません。";
      } catch {
        return "ヘルスチェックが有効なJSONを返していません。";
      }
    }
  },
  {
    name: "robots.txt",
    path: "/robots.txt",
    validate: async (response) => {
      const body = await response.text();
      return /user-agent:/i.test(body)
        ? null
        : "robots.txtにUser-Agentがありません。";
    }
  },
  {
    name: "sitemap.xml",
    path: "/sitemap.xml",
    validate: async (response) => {
      const body = await response.text();
      return /<(?:\w+:)?urlset\b/i.test(body)
        ? null
        : "sitemap.xmlにurlsetがありません。";
    }
  }
];

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    return true;
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

export function validateProductionSiteUrl(value, options = {}) {
  const { allowHttpForTesting = false, allowPrivateForTesting = false } = options;

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("PRODUCTION_SITE_URLが設定されていません。");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PRODUCTION_SITE_URLが有効なURLではありません。");
  }

  const allowedProtocol = url.protocol === "https:" || (allowHttpForTesting && url.protocol === "http:");
  if (!allowedProtocol) {
    throw new Error("PRODUCTION_SITE_URLはHTTPS URLにしてください。");
  }

  if (url.username || url.password) {
    throw new Error("PRODUCTION_SITE_URLに認証情報を含めないでください。");
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PRODUCTION_SITE_URLにはパス・クエリ・ハッシュを含めないでください。");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!allowPrivateForTesting) {
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      throw new Error("localhostは本番監視先に指定できません。");
    }

    const ipVersion = isIP(hostname);
    if ((ipVersion === 4 && isPrivateIpv4(hostname)) || (ipVersion === 6 && isPrivateIpv6(hostname))) {
      throw new Error("プライベートまたはループバックIPは本番監視先に指定できません。");
    }
  }

  return new URL(url.origin);
}

function sanitizeError(error) {
  if (error?.name === "AbortError") {
    return "応答がタイムアウトしました。";
  }

  if (error instanceof Error) {
    return error.message.slice(0, 300);
  }

  return "不明なエラーが発生しました。";
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function checkTarget(baseUrl, target, options) {
  const {
    attempts,
    timeoutMs,
    retryDelayMs,
    fetchImplementation
  } = options;

  let lastResult = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const targetUrl = new URL(target.path, baseUrl);

    try {
      const response = await fetchImplementation(targetUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          accept: "text/html,application/json,application/xml,text/plain;q=0.9,*/*;q=0.8",
          "user-agent": "lol-type-choice-production-monitor/1.0"
        },
        signal: controller.signal
      });

      const durationMs = Date.now() - startedAt;
      if (!response.ok) {
        lastResult = {
          name: target.name,
          path: target.path,
          ok: false,
          status: response.status,
          durationMs,
          attempt,
          error: `HTTP ${response.status}を返しました。`
        };
      } else {
        const validationError = await target.validate(response);
        lastResult = {
          name: target.name,
          path: target.path,
          ok: validationError === null,
          status: response.status,
          durationMs,
          attempt,
          error: validationError
        };
      }
    } catch (error) {
      lastResult = {
        name: target.name,
        path: target.path,
        ok: false,
        status: null,
        durationMs: Date.now() - startedAt,
        attempt,
        error: sanitizeError(error)
      };
    } finally {
      clearTimeout(timeout);
    }

    if (lastResult.ok) {
      return lastResult;
    }

    if (attempt < attempts) {
      await sleep(retryDelayMs);
    }
  }

  return lastResult;
}

export async function runProductionHealthCheck(options = {}) {
  const {
    siteUrl,
    targets = DEFAULT_HEALTH_TARGETS,
    attempts = DEFAULT_ATTEMPTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    fetchImplementation = fetch,
    allowHttpForTesting = false,
    allowPrivateForTesting = false
  } = options;

  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new Error("attemptsは1から5の整数で指定してください。");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new Error("timeoutMsは100から30000の整数で指定してください。");
  }
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 10_000) {
    throw new Error("retryDelayMsは0から10000の整数で指定してください。");
  }

  const baseUrl = validateProductionSiteUrl(siteUrl, {
    allowHttpForTesting,
    allowPrivateForTesting
  });
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  const checks = [];

  for (const target of targets) {
    checks.push(
      await checkTarget(baseUrl, target, {
        attempts,
        timeoutMs,
        retryDelayMs,
        fetchImplementation
      })
    );
  }

  return {
    version: 1,
    checkedAt,
    baseUrl: baseUrl.origin,
    ok: checks.every((check) => check.ok),
    durationMs: Date.now() - startedAt,
    checks
  };
}

export function formatHealthReportMarkdown(report, heading = "本番外形監視結果") {
  const lines = [
    `## ${heading}`,
    "",
    `- 確認日時: ${report.checkedAt}`,
    `- 監視先: ${report.baseUrl}`,
    `- 結果: ${report.ok ? "正常" : "異常"}`,
    `- 合計時間: ${report.durationMs}ms`,
    "",
    "| 対象 | パス | 結果 | HTTP | 応答時間 | 試行回数 | 詳細 |",
    "|---|---|---|---:|---:|---:|---|"
  ];

  for (const check of report.checks) {
    const detail = check.error ? String(check.error).replaceAll("|", "\\|") : "-";
    lines.push(
      `| ${check.name} | \`${check.path}\` | ${check.ok ? "正常" : "異常"} | ${check.status ?? "-"} | ${check.durationMs}ms | ${check.attempt} | ${detail} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const reportPath = process.env.HEALTH_REPORT_PATH || "production-health-report.json";
  let report;

  try {
    report = await runProductionHealthCheck({
      siteUrl: process.env.PRODUCTION_SITE_URL,
      attempts: Number(process.env.HEALTH_ATTEMPTS || DEFAULT_ATTEMPTS),
      timeoutMs: Number(process.env.HEALTH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
      retryDelayMs: Number(process.env.HEALTH_RETRY_DELAY_MS || DEFAULT_RETRY_DELAY_MS)
    });
  } catch (error) {
    console.error(`[ERROR] ${sanitizeError(error)}`);
    process.exitCode = 2;
    return;
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });

  console.log(formatHealthReportMarkdown(report));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

const entryPointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPointUrl && import.meta.url === entryPointUrl) {
  await main();
}
