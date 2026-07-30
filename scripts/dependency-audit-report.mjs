import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SEVERITIES = ["info", "low", "moderate", "high", "critical"];

const emptyCounts = () => ({
  info: 0,
  low: 0,
  moderate: 0,
  high: 0,
  critical: 0,
  total: 0
});

const makeFallbackReport = (message) => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: "critical",
  summary: {
    all: emptyCounts(),
    production: emptyCounts(),
    developmentOnly: emptyCounts()
  },
  checks: [
    {
      id: "report_validation",
      label: "依存関係監査レポート",
      status: "critical",
      message,
      details: {}
    }
  ]
});

const validateCounts = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}の脆弱性集計がありません。`);
  }

  const counts = {};
  for (const severity of [...SEVERITIES, "total"]) {
    const count = value[severity];
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`${label}の${severity}件数が不正です。`);
    }
    counts[severity] = count;
  }

  const calculatedTotal = SEVERITIES.reduce((sum, severity) => sum + counts[severity], 0);
  if (counts.total !== calculatedTotal) {
    throw new Error(`${label}のtotal件数が重大度別件数と一致しません。`);
  }

  return counts;
};

export const validateNpmAuditReport = (input, label) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label}がJSONオブジェクトではありません。`);
  }
  if (input.auditReportVersion !== 2) {
    throw new Error(`${label}のauditReportVersionが未対応です。`);
  }

  return validateCounts(input.metadata?.vulnerabilities, label);
};

const subtractCounts = (all, production) => {
  const result = {};
  for (const severity of SEVERITIES) {
    result[severity] = Math.max(all[severity] - production[severity], 0);
  }
  result.total = SEVERITIES.reduce((sum, severity) => sum + result[severity], 0);
  return result;
};

const statusFor = ({ all, production }) => {
  if (production.high > 0 || production.critical > 0 || all.critical > 0) {
    return "critical";
  }
  if (production.moderate > 0 || all.high > 0 || all.moderate > 0) {
    return "warning";
  }
  return "healthy";
};

const countMessage = (counts) =>
  `critical ${counts.critical}件 / high ${counts.high}件 / moderate ${counts.moderate}件 / low ${counts.low}件`;

export const normalizeDependencyAuditReports = ({
  allReport,
  productionReport,
  generatedAt = new Date().toISOString()
}) => {
  const all = validateNpmAuditReport(allReport, "全依存関係監査");
  const production = validateNpmAuditReport(productionReport, "本番依存関係監査");
  const developmentOnly = subtractCounts(all, production);
  const status = statusFor({ all, production });

  const productionStatus =
    production.high > 0 || production.critical > 0
      ? "critical"
      : production.moderate > 0
        ? "warning"
        : "healthy";
  const developmentStatus =
    developmentOnly.critical > 0
      ? "critical"
      : developmentOnly.high > 0 || developmentOnly.moderate > 0
        ? "warning"
        : "healthy";

  return {
    schemaVersion: 1,
    generatedAt,
    status,
    summary: {
      all,
      production,
      developmentOnly
    },
    checks: [
      {
        id: "production_dependencies",
        label: "本番依存関係",
        status: productionStatus,
        message: countMessage(production),
        details: { ...production }
      },
      {
        id: "development_dependencies",
        label: "開発依存関係のみ",
        status: developmentStatus,
        message: countMessage(developmentOnly),
        details: { ...developmentOnly }
      },
      {
        id: "all_dependencies",
        label: "全依存関係",
        status:
          all.critical > 0 ? "critical" : all.high > 0 || all.moderate > 0 ? "warning" : "healthy",
        message: countMessage(all),
        details: { ...all }
      }
    ]
  };
};

const safeReadAuditJson = async (path, label) => {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label}を読み取れません。`);
  }
};

export const loadAndNormalizeDependencyAudit = async ({
  allReportPath,
  productionReportPath,
  lockfileValid = true
}) => {
  if (!lockfileValid) {
    return makeFallbackReport("package.jsonとpackage-lock.jsonの整合性確認に失敗しました。");
  }

  try {
    const [allReport, productionReport] = await Promise.all([
      safeReadAuditJson(allReportPath, "全依存関係監査結果"),
      safeReadAuditJson(productionReportPath, "本番依存関係監査結果")
    ]);
    return normalizeDependencyAuditReports({ allReport, productionReport });
  } catch {
    return makeFallbackReport("npm auditの結果を安全に検証できませんでした。");
  }
};

const escapeMarkdown = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");

export const formatDependencyAuditMarkdown = (report, title = "依存関係監査結果") => {
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
    lines.push(`| ${escapeMarkdown(check.label)} | ${result} | ${escapeMarkdown(check.message)} |`);
  }

  return `${lines.join("\n")}\n`;
};

export const shouldFailDependencyAudit = (report, { failOnWarning = true } = {}) =>
  report.status === "critical" || (failOnWarning && report.status === "warning");

const runCli = async () => {
  const allReportPath = process.env.DEPENDENCY_AUDIT_ALL_PATH || "dependency-audit-all.raw.json";
  const productionReportPath =
    process.env.DEPENDENCY_AUDIT_PRODUCTION_PATH || "dependency-audit-production.raw.json";
  const outputPath = process.env.DEPENDENCY_AUDIT_REPORT_PATH || "dependency-audit-report.json";
  const markdownPath =
    process.env.DEPENDENCY_AUDIT_MARKDOWN_PATH || "dependency-audit-report.md";
  const lockfileValid = process.env.DEPENDENCY_LOCKFILE_VALID !== "false";
  const failOnWarning = process.env.DEPENDENCY_AUDIT_FAIL_ON_WARNING !== "false";

  const report = await loadAndNormalizeDependencyAudit({
    allReportPath,
    productionReportPath,
    lockfileValid
  });
  const markdown = formatDependencyAuditMarkdown(report);

  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(markdownPath, markdown, { mode: 0o600 });
  process.stdout.write(markdown);

  if (shouldFailDependencyAudit(report, { failOnWarning })) {
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(() => {
    console.error("依存関係監査レポートの生成に失敗しました。");
    process.exitCode = 1;
  });
}
