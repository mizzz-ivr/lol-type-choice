import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PACKAGE_NAME_PATTERN = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/;
const VERSION_PATTERN = /^[0-9A-Za-z.+_-]+$/;
const VALID_SEVERITIES = new Set(["info", "low", "moderate", "high", "critical"]);

export const extractFixCandidates = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  if (!input.vulnerabilities || typeof input.vulnerabilities !== "object") return [];

  return Object.entries(input.vulnerabilities)
    .slice(0, 100)
    .flatMap(([name, vulnerability]) => {
      if (!PACKAGE_NAME_PATTERN.test(name)) return [];
      if (!vulnerability || typeof vulnerability !== "object" || Array.isArray(vulnerability)) {
        return [];
      }
      if (!VALID_SEVERITIES.has(vulnerability.severity)) return [];

      const fix = vulnerability.fixAvailable;
      const fixVersion =
        fix && typeof fix === "object" && VERSION_PATTERN.test(fix.version) ? fix.version : null;

      return [
        {
          name,
          severity: vulnerability.severity,
          direct: vulnerability.isDirect === true,
          fixAvailable: fix !== false && fix != null,
          fixVersion,
          semverMajor: fix && typeof fix === "object" ? fix.isSemVerMajor === true : null
        }
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};

const runCli = async () => {
  const reportPath = process.env.DEPENDENCY_AUDIT_ALL_PATH || "dependency-audit-all.raw.json";

  try {
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const candidates = extractFixCandidates(report);

    console.log("依存関係の修正候補:");
    for (const item of candidates) {
      const target = item.fixVersion
        ? `${item.fixVersion}${item.semverMajor ? "（major更新）" : ""}`
        : item.fixAvailable
          ? "修正版あり（バージョン未提示）"
          : "修正版なし";
      console.log(`- ${item.name}: ${item.severity}, ${target}`);
    }
  } catch {
    console.log("依存関係の修正候補を安全に抽出できませんでした。");
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
