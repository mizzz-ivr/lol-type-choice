import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { formatReadinessMarkdown } from "./release-readiness.mjs";

export const mergeDomainSecurityReadiness = (readinessReport, domainReport) => {
  if (!readinessReport || !Array.isArray(readinessReport.checks)) {
    throw new Error("リリース可否レポートの形式が不正です。");
  }

  const checks = readinessReport.checks.filter((check) => check.id !== "domain_security");

  if (readinessReport.mode === "post_deploy") {
    const domainStatus = domainReport?.status;
    const passed = domainStatus === "healthy" || domainStatus === "warning";
    const message =
      domainStatus === "healthy"
        ? "DNS解決とTLS証明書に問題はありません。"
        : domainStatus === "warning"
          ? `DNS・TLS監視は警告です。公開は継続できますが対応が必要です: ${domainReport.message}`
          : domainStatus === "critical"
            ? `DNS・TLS監視が重大判定です: ${domainReport.message}`
            : "DNS・TLS監視レポートを確認できません。";

    checks.push({
      id: "domain_security",
      label: "DNS・TLS証明書",
      status: passed ? "passed" : "failed",
      message
    });
  }

  const status = checks.every((check) => check.status === "passed") ? "GO" : "NO-GO";
  return { ...readinessReport, status, checks };
};

const runCli = async () => {
  const readinessPath = process.env.RELEASE_REPORT_PATH || "release-readiness-report.json";
  const readinessMarkdownPath = process.env.RELEASE_MARKDOWN_PATH || "release-readiness-report.md";
  const domainPath = process.env.DOMAIN_SECURITY_REPORT_PATH || "domain-security-report.json";

  const readinessReport = JSON.parse(await readFile(readinessPath, "utf8"));
  let domainReport = null;

  if (readinessReport.mode === "post_deploy") {
    try {
      domainReport = JSON.parse(await readFile(domainPath, "utf8"));
    } catch {
      domainReport = null;
    }
  }

  const mergedReport = mergeDomainSecurityReadiness(readinessReport, domainReport);
  const markdown = formatReadinessMarkdown(mergedReport);

  await writeFile(readinessPath, `${JSON.stringify(mergedReport, null, 2)}\n`, { mode: 0o600 });
  await writeFile(readinessMarkdownPath, markdown, { mode: 0o600 });
  process.stdout.write(markdown);

  if (mergedReport.status !== "GO") {
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
