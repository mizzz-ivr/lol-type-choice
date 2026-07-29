import { lookup } from "node:dns/promises";
import { writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import tls from "node:tls";
import { pathToFileURL } from "node:url";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WARNING_DAYS = 30;
const DEFAULT_CRITICAL_DAYS = 14;
const DEFAULT_TIMEOUT_MS = 10_000;

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseIpv4 = (address) => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
};

export const isPublicIpAddress = (address) => {
  const version = isIP(address);

  if (version === 4) {
    const parts = parseIpv4(address);
    if (!parts) return false;

    const [a, b, c] = parts;
    return !(
      a === 0 ||
      a === 10 ||
      (a === 100 && b >= 64 && b <= 127) ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("::ffff:") ||
      normalized.startsWith("64:ff9b:1:") ||
      normalized.startsWith("100:") ||
      normalized.startsWith("2001:db8:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff")
    );
  }

  return false;
};

export const validateProductionSiteUrl = (value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return "PRODUCTION_SITE_URLが未設定です。";
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return "PRODUCTION_SITE_URLをURLとして解釈できません。";
  }

  if (url.protocol !== "https:") {
    return "PRODUCTION_SITE_URLはHTTPSで指定してください。";
  }
  if (url.username || url.password) {
    return "PRODUCTION_SITE_URLに認証情報を含めないでください。";
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    return "PRODUCTION_SITE_URLにはパス・クエリ・ハッシュを含めないでください。";
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return "PRODUCTION_SITE_URLにlocalhostを指定できません。";
  }
  if (isIP(hostname) !== 0 && !isPublicIpAddress(hostname)) {
    return "PRODUCTION_SITE_URLに非公開IPアドレスを指定できません。";
  }

  return null;
};

export const resolvePublicAddresses = async (hostname, resolveHost = lookup) => {
  const resolved = await resolveHost(hostname, { all: true, verbatim: true });
  const addresses = [...new Map(resolved.map((entry) => [entry.address, entry])).values()];

  if (addresses.length === 0) {
    throw new Error("DNS解決結果がありません。AまたはAAAAレコードを確認してください。");
  }

  const invalidAddresses = addresses.filter((entry) => !isPublicIpAddress(entry.address));
  if (invalidAddresses.length > 0) {
    throw new Error(
      `DNSが非公開または予約済みIPへ解決されています: ${invalidAddresses
        .map((entry) => entry.address)
        .join(", ")}`
    );
  }

  return addresses.sort((left, right) => left.family - right.family || left.address.localeCompare(right.address));
};

export const inspectTlsEndpoint = async (
  { hostname, address, port = 443, timeoutMs = DEFAULT_TIMEOUT_MS },
  connectTls = tls.connect
) =>
  new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const socket = connectTls({
      host: address,
      port,
      servername: hostname,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2"
    });

    const timeout = setTimeout(() => {
      socket.destroy();
      finish(() => reject(new Error(`TLS接続が${timeoutMs}ms以内に完了しませんでした。`)));
    }, timeoutMs);

    const cleanup = () => clearTimeout(timeout);

    socket.once("error", (error) => {
      cleanup();
      finish(() => reject(new Error(`TLS接続または証明書検証に失敗しました: ${error.message}`)));
    });

    socket.once("secureConnect", () => {
      cleanup();

      if (!socket.authorized) {
        socket.destroy();
        finish(() => reject(new Error(`TLS証明書を信頼できません: ${socket.authorizationError ?? "unknown"}`)));
        return;
      }

      const certificate = socket.getPeerCertificate(false);
      if (!certificate || typeof certificate.valid_to !== "string") {
        socket.destroy();
        finish(() => reject(new Error("TLS証明書の有効期限を取得できませんでした。")));
        return;
      }

      const result = {
        address,
        protocol: socket.getProtocol() ?? "unknown",
        cipher: socket.getCipher()?.name ?? "unknown",
        validFrom: certificate.valid_from ?? null,
        validTo: certificate.valid_to,
        subjectCommonName: certificate.subject?.CN ?? null,
        issuerCommonName: certificate.issuer?.CN ?? null,
        subjectAltName: certificate.subjectaltname ?? null,
        fingerprint256: certificate.fingerprint256 ?? null
      };

      socket.end();
      finish(() => resolve(result));
    });
  });

export const evaluateCertificate = (
  certificate,
  {
    now = new Date(),
    warningDays = DEFAULT_WARNING_DAYS,
    criticalDays = DEFAULT_CRITICAL_DAYS
  } = {}
) => {
  const validFrom = certificate.validFrom ? new Date(certificate.validFrom) : null;
  const validTo = new Date(certificate.validTo);

  if (Number.isNaN(validTo.getTime())) {
    return { status: "critical", daysRemaining: null, message: "証明書の有効期限を解釈できません。" };
  }
  if (validFrom && !Number.isNaN(validFrom.getTime()) && validFrom.getTime() > now.getTime()) {
    return { status: "critical", daysRemaining: null, message: "証明書はまだ有効期間に入っていません。" };
  }

  const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / DAY_MS);
  if (daysRemaining < 0) {
    return { status: "critical", daysRemaining, message: `証明書が${Math.abs(daysRemaining)}日前に期限切れしています。` };
  }
  if (daysRemaining <= criticalDays) {
    return { status: "critical", daysRemaining, message: `証明書の有効期限まで${daysRemaining}日です。` };
  }
  if (daysRemaining <= warningDays) {
    return { status: "warning", daysRemaining, message: `証明書の有効期限まで${daysRemaining}日です。更新状況を確認してください。` };
  }

  return { status: "healthy", daysRemaining, message: `証明書の有効期限まで${daysRemaining}日あります。` };
};

const toSafeErrorMessage = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll("\n", " ").slice(0, 500);
};

export const runDomainSecurityCheck = async ({
  siteUrl,
  resolveHost = lookup,
  connectTls = tls.connect,
  now = new Date(),
  warningDays = DEFAULT_WARNING_DAYS,
  criticalDays = DEFAULT_CRITICAL_DAYS,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) => {
  const generatedAt = now.toISOString();
  const urlError = validateProductionSiteUrl(siteUrl);

  if (urlError) {
    return {
      schemaVersion: 1,
      generatedAt,
      siteUrl: null,
      hostname: null,
      status: "critical",
      dns: { addresses: [] },
      tls: null,
      message: urlError
    };
  }

  if (!Number.isInteger(warningDays) || !Number.isInteger(criticalDays) || criticalDays < 1 || warningDays <= criticalDays) {
    return {
      schemaVersion: 1,
      generatedAt,
      siteUrl,
      hostname: new URL(siteUrl).hostname,
      status: "critical",
      dns: { addresses: [] },
      tls: null,
      message: "証明書期限の警告・重大しきい値が不正です。"
    };
  }

  const url = new URL(siteUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  try {
    const addresses = await resolvePublicAddresses(hostname, resolveHost);
    const selected = addresses.find((entry) => entry.family === 4) ?? addresses[0];
    const certificate = await inspectTlsEndpoint(
      { hostname, address: selected.address, port: Number(url.port) || 443, timeoutMs },
      connectTls
    );
    const evaluation = evaluateCertificate(certificate, { now, warningDays, criticalDays });

    return {
      schemaVersion: 1,
      generatedAt,
      siteUrl: url.origin,
      hostname,
      status: evaluation.status,
      dns: {
        addresses: addresses.map((entry) => ({ address: entry.address, family: entry.family })),
        selectedAddress: selected.address
      },
      tls: {
        protocol: certificate.protocol,
        cipher: certificate.cipher,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        daysRemaining: evaluation.daysRemaining,
        subjectCommonName: certificate.subjectCommonName,
        issuerCommonName: certificate.issuerCommonName,
        subjectAltName: certificate.subjectAltName?.slice(0, 500) ?? null,
        fingerprint256: certificate.fingerprint256
      },
      message: evaluation.message
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      generatedAt,
      siteUrl: url.origin,
      hostname,
      status: "critical",
      dns: { addresses: [] },
      tls: null,
      message: toSafeErrorMessage(error)
    };
  }
};

const escapeMarkdown = (value) => String(value ?? "-").replaceAll("|", "\\|").replaceAll("\n", " ");

export const formatDomainSecurityMarkdown = (report, title = "ドメイン・TLS監視結果") => {
  const statusLabel = report.status === "healthy" ? "正常" : report.status === "warning" ? "警告" : "重大";
  const addresses = report.dns.addresses.length
    ? report.dns.addresses.map((entry) => `${entry.address} (IPv${entry.family})`).join(", ")
    : "-";

  const lines = [
    `## ${title}`,
    "",
    `- 判定: **${statusLabel}**`,
    `- 確認日時: ${report.generatedAt}`,
    `- 対象: ${report.siteUrl ?? "未設定"}`,
    `- メッセージ: ${escapeMarkdown(report.message)}`,
    "",
    "| 項目 | 値 |",
    "|---|---|",
    `| ホスト名 | ${escapeMarkdown(report.hostname)} |`,
    `| DNS解決結果 | ${escapeMarkdown(addresses)} |`,
    `| TLS接続先 | ${escapeMarkdown(report.dns.selectedAddress)} |`,
    `| TLSプロトコル | ${escapeMarkdown(report.tls?.protocol)} |`,
    `| 暗号スイート | ${escapeMarkdown(report.tls?.cipher)} |`,
    `| 証明書CN | ${escapeMarkdown(report.tls?.subjectCommonName)} |`,
    `| 発行者 | ${escapeMarkdown(report.tls?.issuerCommonName)} |`,
    `| 有効期限 | ${escapeMarkdown(report.tls?.validTo)} |`,
    `| 残日数 | ${escapeMarkdown(report.tls?.daysRemaining)} |`,
    `| SAN | ${escapeMarkdown(report.tls?.subjectAltName)} |`
  ];

  return `${lines.join("\n")}\n`;
};

const runCli = async () => {
  const warningDays = parsePositiveInteger(process.env.TLS_WARNING_DAYS, DEFAULT_WARNING_DAYS);
  const criticalDays = parsePositiveInteger(process.env.TLS_CRITICAL_DAYS, DEFAULT_CRITICAL_DAYS);
  const timeoutMs = parsePositiveInteger(process.env.DOMAIN_CHECK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  const report = await runDomainSecurityCheck({
    siteUrl: process.env.PRODUCTION_SITE_URL,
    warningDays,
    criticalDays,
    timeoutMs
  });

  const reportPath = process.env.DOMAIN_SECURITY_REPORT_PATH || "domain-security-report.json";
  const markdownPath = process.env.DOMAIN_SECURITY_MARKDOWN_PATH || "domain-security-report.md";
  const markdown = formatDomainSecurityMarkdown(report);

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(markdownPath, markdown, { mode: 0o600 });
  process.stdout.write(markdown);

  if (report.status === "critical") {
    process.exitCode = 1;
  } else if (report.status === "warning") {
    process.exitCode = 2;
  }
};

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  await runCli();
}
