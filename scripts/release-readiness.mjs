import { isIP } from "node:net";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const RELEASE_MODES = new Set(["pre_deploy", "post_deploy"]);

export const parseBoolean = (value) => value === true || value === "true";

const isPrivateIpv4 = (hostname) => {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
};

const isPrivateIpv6 = (hostname) => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:")
  );
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

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return "PRODUCTION_SITE_URLにlocalhostを指定できません。";
  }

  const ipVersion = isIP(hostname.replace(/^\[|\]$/g, ""));
  if (ipVersion === 4 && isPrivateIpv4(hostname)) {
    return "PRODUCTION_SITE_URLにプライベートまたはループバックIPv4を指定できません。";
  }
  if (ipVersion === 6 && isPrivateIpv6(hostname)) {
    return "PRODUCTION_SITE_URLにプライベートまたはループバックIPv6を指定できません。";
  }

  return null;
};

const validateHost = (value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return "PRODUCTION_HOSTが未設定です。";
  }
  if (!/^[A-Za-z0-9.-]+$/.test(value.trim())) {
    return "PRODUCTION_HOSTの形式が不正です。";
  }
  if (value.trim().toLowerCase() === "localhost") {
    return "PRODUCTION_HOSTにlocalhostを指定できません。";
  }
  return null;
};

const validateUser = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value.trim())) {
    return "PRODUCTION_USERの形式が不正です。";
  }
  return null;
};

const validatePort = (value) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "PRODUCTION_SSH_PORTは1から65535の整数で指定してください。";
  }
  return null;
};

const validateAppRoot = (value) => {
  if (typeof value !== "string" || !/^\/[A-Za-z0-9._/-]+$/.test(value.trim())) {
    return "PRODUCTION_APP_ROOTは安全な絶対パスで指定してください。";
  }
  if (value.includes("//") || value.includes("/../") || value.endsWith("/..")) {
    return "PRODUCTION_APP_ROOTに不正なパス要素が含まれています。";
  }
  return null;
};

const addCheck = (checks, id, label, passed, message) => {
  checks.push({ id, label, status: passed ? "passed" : "failed", message });
};

export const evaluateReleaseReadiness = (input) => {
  const checks = [];
  const mode = input.mode;
  const releaseSha = input.releaseSha;

  addCheck(
    checks,
    "mode",
    "判定モード",
    RELEASE_MODES.has(mode),
    RELEASE_MODES.has(mode) ? `${mode}モードです。` : "判定モードが不正です。"
  );

  const shaValid = typeof releaseSha === "string" && /^[0-9a-f]{40}$/.test(releaseSha);
  addCheck(
    checks,
    "release_sha",
    "対象コミットSHA",
    shaValid,
    shaValid ? "40桁のコミットSHAです。" : "対象コミットSHAの形式が不正です。"
  );

  addCheck(
    checks,
    "quality",
    "コード品質ゲート",
    parseBoolean(input.qualityChecksPassed),
    parseBoolean(input.qualityChecksPassed)
      ? "Lint・Test・Build・standaloneスモークテストが成功しています。"
      : "コード品質ゲートが成功していません。"
  );

  const siteUrlError = validateProductionSiteUrl(input.productionSiteUrl);
  addCheck(
    checks,
    "production_site_url",
    "本番公開URL",
    siteUrlError === null,
    siteUrlError ?? "HTTPSの公開オリジンが設定されています。"
  );

  const hostError = validateHost(input.productionHost);
  addCheck(
    checks,
    "production_host",
    "本番接続先",
    hostError === null,
    hostError ?? "本番接続先が設定されています。"
  );

  const userError = validateUser(input.productionUser);
  addCheck(
    checks,
    "production_user",
    "本番接続ユーザー",
    userError === null,
    userError ?? "本番接続ユーザーが設定されています。"
  );

  const portError = validatePort(input.productionSshPort);
  addCheck(
    checks,
    "production_ssh_port",
    "SSHポート",
    portError === null,
    portError ?? "SSHポートが有効な範囲です。"
  );

  const appRootError = validateAppRoot(input.productionAppRoot);
  addCheck(
    checks,
    "production_app_root",
    "本番配置先",
    appRootError === null,
    appRootError ?? "本番配置先が安全な絶対パスです。"
  );

  addCheck(
    checks,
    "private_key_configured",
    "SSH秘密鍵の登録",
    parseBoolean(input.privateKeyConfigured),
    parseBoolean(input.privateKeyConfigured)
      ? "デプロイ専用SSH秘密鍵が登録されています。"
      : "PRODUCTION_SSH_PRIVATE_KEYが未設定です。"
  );

  addCheck(
    checks,
    "private_key_valid",
    "SSH秘密鍵の形式",
    parseBoolean(input.privateKeyValid),
    parseBoolean(input.privateKeyValid)
      ? "SSH秘密鍵を読み取れます。"
      : "SSH秘密鍵の形式を確認できません。"
  );

  addCheck(
    checks,
    "known_hosts_configured",
    "known_hostsの登録",
    parseBoolean(input.knownHostsConfigured),
    parseBoolean(input.knownHostsConfigured)
      ? "known_hostsが登録されています。"
      : "PRODUCTION_SSH_KNOWN_HOSTSが未設定です。"
  );

  addCheck(
    checks,
    "known_hosts_match",
    "接続先ホスト鍵",
    parseBoolean(input.knownHostsMatch),
    parseBoolean(input.knownHostsMatch)
      ? "known_hostsに接続先ホスト鍵があります。"
      : "known_hostsに接続先ホスト鍵がありません。"
  );

  const incidentCount = Number(input.openIncidentCount);
  const incidentCountValid = Number.isInteger(incidentCount) && incidentCount >= 0;
  const noOpenIncident = incidentCountValid && incidentCount === 0;
  addCheck(
    checks,
    "open_incidents",
    "未解決の監視障害",
    noOpenIncident,
    !incidentCountValid
      ? "監視障害Issue数を判定できません。"
      : noOpenIncident
        ? "未解決の監視障害Issueはありません。"
        : `未解決の監視障害Issueが${incidentCount}件あります。`
  );

  if (mode === "post_deploy") {
    addCheck(
      checks,
      "post_deploy_smoke",
      "公開後スモークテスト",
      parseBoolean(input.postDeploySmokePassed),
      parseBoolean(input.postDeploySmokePassed)
        ? "本番公開URLのスモークテストが成功しています。"
        : "本番公開URLのスモークテストが成功していません。"
    );
  }

  const status = checks.every((check) => check.status === "passed") ? "GO" : "NO-GO";

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode,
    releaseSha,
    status,
    checks
  };
};

export const formatReadinessMarkdown = (report) => {
  const lines = [
    `## リリース判定: ${report.status}`,
    "",
    `- モード: \`${report.mode}\``,
    `- 対象コミット: \`${report.releaseSha}\``,
    `- 判定日時: ${report.generatedAt}`,
    "",
    "| 確認項目 | 結果 | 詳細 |",
    "|---|---|---|"
  ];

  for (const check of report.checks) {
    const result = check.status === "passed" ? "PASS" : "FAIL";
    const message = check.message.replaceAll("|", "\\|").replaceAll("\n", " ");
    lines.push(`| ${check.label} | ${result} | ${message} |`);
  }

  lines.push("");
  lines.push(
    report.status === "GO"
      ? "すべての必須条件を満たしています。"
      : "失敗項目を解消するまで本番公開または公開完了扱いにしないでください。"
  );

  return `${lines.join("\n")}\n`;
};

const runCli = async () => {
  const report = evaluateReleaseReadiness({
    mode: process.env.RELEASE_MODE,
    releaseSha: process.env.RELEASE_SHA,
    qualityChecksPassed: process.env.QUALITY_CHECKS_PASSED,
    productionSiteUrl: process.env.PRODUCTION_SITE_URL,
    productionHost: process.env.PRODUCTION_HOST,
    productionUser: process.env.PRODUCTION_USER,
    productionSshPort: process.env.PRODUCTION_SSH_PORT || "22",
    productionAppRoot: process.env.PRODUCTION_APP_ROOT || "/var/www/lol-type-choice",
    privateKeyConfigured: process.env.PRIVATE_KEY_CONFIGURED,
    privateKeyValid: process.env.PRIVATE_KEY_VALID,
    knownHostsConfigured: process.env.KNOWN_HOSTS_CONFIGURED,
    knownHostsMatch: process.env.KNOWN_HOSTS_MATCH,
    openIncidentCount: process.env.OPEN_INCIDENT_COUNT,
    postDeploySmokePassed: process.env.POST_DEPLOY_SMOKE_PASSED
  });

  const markdown = formatReadinessMarkdown(report);
  const reportPath = process.env.RELEASE_REPORT_PATH || "release-readiness-report.json";
  const markdownPath = process.env.RELEASE_MARKDOWN_PATH || "release-readiness-report.md";

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(markdownPath, markdown, { mode: 0o600 });
  process.stdout.write(markdown);

  if (report.status !== "GO") {
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
