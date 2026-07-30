import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatDependencyAuditMarkdown,
  loadAndNormalizeDependencyAudit,
  normalizeDependencyAuditReports,
  shouldFailDependencyAudit
} from "./dependency-audit-report.mjs";

const counts = ({ info = 0, low = 0, moderate = 0, high = 0, critical = 0 } = {}) => ({
  info,
  low,
  moderate,
  high,
  critical,
  total: info + low + moderate + high + critical
});

const audit = (vulnerabilities = {}, packages = {}) => ({
  auditReportVersion: 2,
  vulnerabilities: packages,
  metadata: {
    vulnerabilities: counts(vulnerabilities),
    dependencies: {
      prod: 3,
      dev: 9,
      optional: 0,
      peer: 0,
      peerOptional: 0,
      total: 12
    }
  }
});

const vulnerability = ({ severity, direct = false, range = "<1.0.0", fixAvailable = true }) => ({
  name: "ignored",
  severity,
  isDirect: direct,
  via: [],
  effects: [],
  range,
  nodes: [],
  fixAvailable
});

const healthy = normalizeDependencyAuditReports({
  allReport: audit({ low: 2 }),
  productionReport: audit({ low: 1 }),
  generatedAt: "2026-07-30T00:00:00.000Z"
});
assert.equal(healthy.status, "healthy");
assert.equal(healthy.summary.developmentOnly.low, 1);
assert.equal(shouldFailDependencyAudit(healthy), false);

const developmentHigh = normalizeDependencyAuditReports({
  allReport: audit(
    { high: 1 },
    { "dev-package": vulnerability({ severity: "high", direct: true }) }
  ),
  productionReport: audit(),
  generatedAt: "2026-07-30T00:00:00.000Z"
});
assert.equal(developmentHigh.status, "warning");
assert.equal(developmentHigh.checks[1].status, "warning");
assert.equal(developmentHigh.vulnerablePackages[0].scope, "development");
assert.equal(shouldFailDependencyAudit(developmentHigh), true);
assert.equal(shouldFailDependencyAudit(developmentHigh, { failOnWarning: false }), false);

const productionModerate = normalizeDependencyAuditReports({
  allReport: audit(
    { moderate: 1 },
    { "prod-package": vulnerability({ severity: "moderate", range: ">=1 <2" }) }
  ),
  productionReport: audit(
    { moderate: 1 },
    { "prod-package": vulnerability({ severity: "moderate", range: ">=1 <2" }) }
  ),
  generatedAt: "2026-07-30T00:00:00.000Z"
});
assert.equal(productionModerate.status, "warning");
assert.equal(productionModerate.checks[0].status, "warning");
assert.equal(productionModerate.vulnerablePackages[0].scope, "production");

const productionHigh = normalizeDependencyAuditReports({
  allReport: audit(
    { high: 1 },
    { next: vulnerability({ severity: "high", direct: true, range: ">=15 <15.4" }) }
  ),
  productionReport: audit(
    { high: 1 },
    { next: vulnerability({ severity: "high", direct: true, range: ">=15 <15.4" }) }
  ),
  generatedAt: "2026-07-30T00:00:00.000Z"
});
assert.equal(productionHigh.status, "critical");
assert.equal(productionHigh.checks[0].status, "critical");
assert.equal(productionHigh.vulnerablePackages[0].name, "next");
assert.equal(productionHigh.vulnerablePackages[0].direct, true);
assert.equal(productionHigh.vulnerablePackages[0].fixAvailable, true);
assert.equal(shouldFailDependencyAudit(productionHigh, { failOnWarning: false }), true);

const developmentCritical = normalizeDependencyAuditReports({
  allReport: audit(
    { critical: 1 },
    { "build-tool": vulnerability({ severity: "critical", fixAvailable: false }) }
  ),
  productionReport: audit(),
  generatedAt: "2026-07-30T00:00:00.000Z"
});
assert.equal(developmentCritical.status, "critical");
assert.equal(developmentCritical.checks[1].status, "critical");
assert.equal(developmentCritical.vulnerablePackages[0].fixAvailable, false);

const unsafePackageName = normalizeDependencyAuditReports({
  allReport: audit(
    { high: 1 },
    { "bad|name\nsecret": vulnerability({ severity: "high" }) }
  ),
  productionReport: audit(),
  generatedAt: "2026-07-30T00:00:00.000Z"
});
assert.equal(unsafePackageName.vulnerablePackages.length, 0);

assert.throws(
  () =>
    normalizeDependencyAuditReports({
      allReport: audit({ moderate: 1 }),
      productionReport: {
        auditReportVersion: 2,
        metadata: { vulnerabilities: { ...counts(), total: 5 } }
      }
    }),
  /total件数/
);

const directory = await mkdtemp(join(tmpdir(), "dependency-audit-"));
const allPath = join(directory, "all.json");
const productionPath = join(directory, "production.json");

await writeFile(allPath, JSON.stringify(audit()));
await writeFile(productionPath, JSON.stringify(audit()));
const loaded = await loadAndNormalizeDependencyAudit({
  allReportPath: allPath,
  productionReportPath: productionPath,
  lockfileValid: true
});
assert.equal(loaded.status, "healthy");

await writeFile(allPath, "registry-token=do-not-leak");
const invalidJson = await loadAndNormalizeDependencyAudit({
  allReportPath: allPath,
  productionReportPath: productionPath,
  lockfileValid: true
});
assert.equal(invalidJson.status, "critical");
assert.equal(invalidJson.checks[0].id, "report_validation");
assert.equal(JSON.stringify(invalidJson).includes("registry-token"), false);
assert.equal(JSON.stringify(invalidJson).includes("do-not-leak"), false);

const lockfileFailure = await loadAndNormalizeDependencyAudit({
  allReportPath: allPath,
  productionReportPath: productionPath,
  lockfileValid: false
});
assert.equal(lockfileFailure.status, "critical");
assert.match(lockfileFailure.checks[0].message, /package-lock/);

const markdown = formatDependencyAuditMarkdown(productionHigh);
assert.match(markdown, /判定: \*\*重大\*\*/);
assert.match(markdown, /本番依存関係/);
assert.match(markdown, /\| next \| high \| 本番 \| はい \| あり \|/);
assert.equal(markdown.includes("undefined"), false);

console.log("依存関係監査レポートの正常・警告・重大・不正系テストに成功しました。");
