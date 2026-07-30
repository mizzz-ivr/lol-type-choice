import assert from "node:assert/strict";
import {
  applyDependencyAuditExceptions,
  validateDependencyAuditExceptions
} from "./dependency-audit-exceptions.mjs";

const counts = ({ low = 0, moderate = 0, high = 0, critical = 0 } = {}) => ({
  info: 0,
  low,
  moderate,
  high,
  critical,
  total: low + moderate + high + critical
});

const baseReport = () => ({
  schemaVersion: 1,
  generatedAt: "2026-07-30T00:00:00.000Z",
  status: "critical",
  summary: {
    all: counts({ high: 2 }),
    production: counts({ high: 1 }),
    developmentOnly: counts({ high: 1 })
  },
  vulnerablePackages: [
    {
      name: "next",
      severity: "high",
      direct: true,
      affectedRange: ">=15",
      fixAvailable: true,
      scope: "production"
    },
    {
      name: "eslint",
      severity: "high",
      direct: true,
      affectedRange: ">=9",
      fixAvailable: true,
      scope: "development"
    }
  ],
  acceptedExceptions: [],
  checks: [
    {
      id: "production_dependencies",
      label: "本番依存関係",
      status: "critical",
      message: "",
      details: {}
    },
    {
      id: "development_dependencies",
      label: "開発依存関係のみ",
      status: "warning",
      message: "",
      details: {}
    },
    {
      id: "all_dependencies",
      label: "全依存関係",
      status: "warning",
      message: "",
      details: {}
    }
  ]
});

const exception = ({ expiresOn = "2026-08-07", installedVersion = "15.5.22" } = {}) => ({
  schemaVersion: 1,
  exceptions: [
    {
      package: "next",
      severity: "high",
      scope: "production",
      installedVersion,
      expiresOn,
      reason: "安定版修正待ちのため、短期間だけ完全一致条件で追跡する。"
    }
  ]
});

const packageLock = (version = "15.5.22") => ({
  lockfileVersion: 3,
  packages: {
    "node_modules/next": { version }
  }
});

const active = applyDependencyAuditExceptions({
  report: baseReport(),
  exceptionsConfig: exception(),
  packageLock: packageLock(),
  now: new Date("2026-07-30T00:00:00.000Z")
});
assert.equal(active.status, "warning");
assert.equal(active.summary.production.high, 0);
assert.equal(active.summary.all.high, 1);
assert.equal(active.detectedSummary.production.high, 1);
assert.equal(active.acceptedExceptions.length, 1);
assert.equal(active.vulnerablePackages[0].exception.expiresOn, "2026-08-07");
assert.equal(active.checks.at(-1).status, "healthy");

const expired = applyDependencyAuditExceptions({
  report: baseReport(),
  exceptionsConfig: exception({ expiresOn: "2026-07-29" }),
  packageLock: packageLock(),
  now: new Date("2026-07-30T00:00:00.000Z")
});
assert.equal(expired.status, "critical");
assert.equal(expired.acceptedExceptions.length, 0);
assert.match(expired.checks.at(-1).message, /期限切れ/);

const versionMismatch = applyDependencyAuditExceptions({
  report: baseReport(),
  exceptionsConfig: exception(),
  packageLock: packageLock("15.5.23"),
  now: new Date("2026-07-30T00:00:00.000Z")
});
assert.equal(versionMismatch.status, "critical");
assert.match(versionMismatch.checks.at(-1).message, /導入バージョン/);

const noVulnerability = applyDependencyAuditExceptions({
  report: {
    ...baseReport(),
    status: "healthy",
    summary: {
      all: counts(),
      production: counts(),
      developmentOnly: counts()
    },
    vulnerablePackages: []
  },
  exceptionsConfig: exception(),
  packageLock: packageLock(),
  now: new Date("2026-07-30T00:00:00.000Z")
});
assert.equal(noVulnerability.status, "warning");
assert.match(noVulnerability.checks.at(-1).message, /例外削除/);

assert.throws(
  () =>
    validateDependencyAuditExceptions({
      schemaVersion: 1,
      exceptions: [
        {
          package: "*",
          severity: "high",
          scope: "production",
          installedVersion: "15.5.22",
          expiresOn: "2026-08-07",
          reason: "無効なワイルドカード例外を拒否するための十分な長さの理由。"
        }
      ]
    }),
  /package/
);

assert.throws(
  () =>
    validateDependencyAuditExceptions({
      schemaVersion: 1,
      exceptions: [
        {
          package: "next",
          severity: "high",
          scope: "production",
          installedVersion: "15.5.22",
          expiresOn: "not-a-date",
          reason: "不正な有効期限を拒否するための十分な長さの理由。"
        }
      ]
    }),
  /expiresOn/
);

console.log("依存関係監査の期限付き例外テストに成功しました。");
