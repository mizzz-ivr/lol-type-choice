import assert from "node:assert/strict";
import { mergeDomainSecurityReadiness } from "./merge-domain-security-readiness.mjs";

const baseReport = {
  schemaVersion: 1,
  generatedAt: "2026-07-29T00:00:00.000Z",
  mode: "post_deploy",
  releaseSha: "a".repeat(40),
  status: "GO",
  checks: [
    { id: "quality", label: "コード品質ゲート", status: "passed", message: "成功" },
    { id: "post_deploy_smoke", label: "公開後スモークテスト", status: "passed", message: "成功" }
  ]
};

const healthy = mergeDomainSecurityReadiness(baseReport, {
  status: "healthy",
  message: "証明書の有効期限まで60日あります。"
});
assert.equal(healthy.status, "GO");
assert.equal(healthy.checks.find((check) => check.id === "domain_security")?.status, "passed");
assert.match(healthy.checks.find((check) => check.id === "domain_security")?.message ?? "", /問題はありません/);

const warning = mergeDomainSecurityReadiness(baseReport, {
  status: "warning",
  message: "証明書の有効期限まで20日です。"
});
assert.equal(warning.status, "GO");
assert.equal(warning.checks.find((check) => check.id === "domain_security")?.status, "passed");
assert.match(warning.checks.find((check) => check.id === "domain_security")?.message ?? "", /警告/);

const critical = mergeDomainSecurityReadiness(baseReport, {
  status: "critical",
  message: "証明書の有効期限まで7日です。"
});
assert.equal(critical.status, "NO-GO");
assert.equal(critical.checks.find((check) => check.id === "domain_security")?.status, "failed");

const missing = mergeDomainSecurityReadiness(baseReport, null);
assert.equal(missing.status, "NO-GO");
assert.match(missing.checks.find((check) => check.id === "domain_security")?.message ?? "", /確認できません/);

const preDeploy = mergeDomainSecurityReadiness(
  { ...baseReport, mode: "pre_deploy", checks: baseReport.checks.slice(0, 1) },
  null
);
assert.equal(preDeploy.status, "GO");
assert.equal(preDeploy.checks.some((check) => check.id === "domain_security"), false);

const existingFailure = mergeDomainSecurityReadiness(
  {
    ...baseReport,
    status: "NO-GO",
    checks: [
      ...baseReport.checks,
      { id: "open_incidents", label: "未解決の監視障害", status: "failed", message: "1件" }
    ]
  },
  { status: "healthy", message: "正常" }
);
assert.equal(existingFailure.status, "NO-GO");

const mergedTwice = mergeDomainSecurityReadiness(healthy, {
  status: "warning",
  message: "証明書の有効期限まで20日です。"
});
assert.equal(mergedTwice.checks.filter((check) => check.id === "domain_security").length, 1);

assert.throws(() => mergeDomainSecurityReadiness(null, null), /形式が不正/);
assert.equal(JSON.stringify(healthy).includes("PRIVATE KEY"), false);

console.log("DNS・TLS結果のリリース可否統合テストに成功しました。\n");
