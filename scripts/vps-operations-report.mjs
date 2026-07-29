import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const REQUIRED_CHECKS = new Map([
  ["nginx", "Nginx"],
  ["pm2", "PM2アプリ"],
  ["local_health", "ローカルヘルス"],
  ["release", "現在のリリース"],
  ["disk", "ディスク使用率"],
  ["certbot_timer", "Certbot更新タイマー"]
]);

const VALID_STATUSES = new Set(["healthy", "warning", "critical"]);

const safeString = (value, fallback = "-") => {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  return value.replaceAll("\n", " ").slice(0, 500);
};

const makeFallbackReport = (message) => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: "critical",
  checks: [
    {
      id: "report_validation",
      label: "監査レポート",
      status: "critical",
      message: safeString(message, "VPS運用監査レポートを検証できません。"),
      details: {}
    }
  ]
});

const sanitizeDetails = (details) => {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};

  const result = {};
  for (const [key, value] of Object.entries(details).slice(0, 20)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) continue;

    if (typeof value === "string") {
      result[key] = safeString(value);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    } else if (typeof value === "boolean" || value === null) {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value
        .slice(0, 20)
        .filter((item) => typeof item === "string")
        .map((item) => safeString(item));
    }
  }
  return result;
};

export const validateVpsOperationsReport = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("監査レポートがJSONオブジェクトではありません。");
  }
  if (input.schemaVersion !== 1) {
    throw new Error("監査レポートのschemaVersionが未対応です。");
  }
  if (typeof input.generatedAt !== "string" || Number.isNaN(Date.parse(input.generatedAt))) {
    throw new Error("監査レポートのgeneratedAtが不正です。");
  }
  if (!VALID_STATUSES.has(input.status)) {
    throw new Error("監査レポートのstatusが不正です。");
  }
  if (!Array.isArray(input.checks)) {
    throw new Error("監査レポートのchecksが配列ではありません。");
  }

  const normalizedChecks = [];
  const seen = new Set();

  for (const check of input.checks) {
    if (!check || typeof check !== "object" || Array.isArray(check)) {
      throw new Error("監査項目の形式が不正です。");
    }

    const expectedLabel = REQUIRED_CHECKS.get(check.id);
    if (!expectedLabel) {
      throw new Error(`未対応の監査項目です: ${safeString(check.id, "unknown")}`);
    }
    if (seen.has(check.id)) {
      throw new Error(`監査項目が重複しています: ${check.id}`);
    }
    if (check.label !== expectedLabel) {
      throw new Error(`監査項目のlabelが不正です: ${check.id}`);
    }
    if (!VALID_STATUSES.has(check.status)) {
      throw new Error(`監査項目のstatusが不正です: ${check.id}`);
    }

    seen.add(check.id);
    normalizedChecks.push({
      id: check.id,
      label: expectedLabel,
      status: check.status,
      message: safeString(check.message, "詳細を取得できません。"),
      details: sanitizeDetails(check.details)
    });
  }

  for (const id of REQUIRED_CHECKS.keys()) {
    if (!seen.has(id)) {
      throw new Error(`必須監査項目がありません: ${id}`);
    }
  }

  const expectedStatus = normalizedChecks.some((check) => check.status === "critical")
    ? "critical"
    : normalizedChecks.some((check) => check.status === "warning")
      ? "warning"
      : "healthy";

  if (input.status !== expectedStatus) {
    throw new Error("全体statusと監査項目のstatusが一致しません。");
  }

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    status: expectedStatus,
    checks: normalizedChecks
  };
};

const escapeMarkdown = (value) => safeString(value).replaceAll("|", "\\|");

export const formatVpsOperationsMarkdown = (report, title = "VPS運用監査結果") => {
  const statusLabel =
    report.status === "healthy" ? "正常" : report.status === "warning" ? "警告" : "重大";

  const lines = [
    `## ${title}`,
    "",
    `- 判定: **${statusLabel}**`,
    `- 確認日時: ${report.generatedAt}`,
    "",
    "| 確認項目 | 結果 | 詳細 |",
    "|---|---|---|"
  ];

  for (const check of report.checks) {
    const result = check.status === "healthy" ? "PASS" : check.status === "warning" ? "WARN" : "FAIL";
    lines.push(`| ${check.label} | ${result} | ${escapeMarkdown(check.message)} |`);
  }

  return `${lines.join("\n")}\n`;
};

export const loadAndNormalizeReport = async ({ reportPath, sshSucceeded = true }) => {
  if (!sshSucceeded) {
    return makeFallbackReport("制限付きSSHによるVPS運用監査に失敗しました。");
  }

  try {
    const raw = await readFile(reportPath, "utf8");
    const parsed = JSON.parse(raw);
    return validateVpsOperationsReport(parsed);
  } catch (error) {
    return makeFallbackReport(error instanceof Error ? error.message : "監査レポートを検証できません。");
  }
};

const runCli = async () => {
  const reportPath = process.env.VPS_OPERATIONS_RAW_REPORT || "vps-operations-raw.json";
  const normalizedPath = process.env.VPS_OPERATIONS_REPORT_PATH || "vps-operations-report.json";
  const markdownPath = process.env.VPS_OPERATIONS_MARKDOWN_PATH || "vps-operations-report.md";
  const sshSucceeded = process.env.VPS_OBSERVATION_SSH_SUCCEEDED === "true";

  const report = await loadAndNormalizeReport({ reportPath, sshSucceeded });
  const markdown = formatVpsOperationsMarkdown(report);

  await writeFile(normalizedPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(markdownPath, markdown, { mode: 0o600 });
  process.stdout.write(markdown);

  if (report.status !== "healthy") {
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
