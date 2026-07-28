import assert from "node:assert/strict";
import {
  evaluateReleaseReadiness,
  formatReadinessMarkdown,
  validateProductionSiteUrl
} from "./release-readiness.mjs";

const baseInput = {
  mode: "pre_deploy",
  releaseSha: "a".repeat(40),
  qualityChecksPassed: true,
  productionSiteUrl: "https://lol.example.com",
  productionHost: "203.0.113.10",
  productionUser: "ubuntu",
  productionSshPort: "22",
  productionAppRoot: "/var/www/lol-type-choice",
  privateKeyConfigured: true,
  privateKeyValid: true,
  knownHostsConfigured: true,
  knownHostsMatch: true,
  openIncidentCount: 0,
  postDeploySmokePassed: true
};

const expectNoGo = (overrides, failedCheckId) => {
  const report = evaluateReleaseReadiness({ ...baseInput, ...overrides });
  assert.equal(report.status, "NO-GO");
  assert.equal(
    report.checks.find((check) => check.id === failedCheckId)?.status,
    "failed",
    `${failedCheckId}が失敗扱いになっていません。`
  );
};

const preDeployReport = evaluateReleaseReadiness(baseInput);
assert.equal(preDeployReport.status, "GO");
assert.equal(preDeployReport.checks.some((check) => check.id === "post_deploy_smoke"), false);

const postDeployReport = evaluateReleaseReadiness({ ...baseInput, mode: "post_deploy" });
assert.equal(postDeployReport.status, "GO");
assert.equal(postDeployReport.checks.find((check) => check.id === "post_deploy_smoke")?.status, "passed");

expectNoGo({ mode: "unknown" }, "mode");
expectNoGo({ releaseSha: "abc" }, "release_sha");
expectNoGo({ qualityChecksPassed: false }, "quality");
expectNoGo({ productionSiteUrl: "" }, "production_site_url");
expectNoGo({ productionSiteUrl: "http://lol.example.com" }, "production_site_url");
expectNoGo({ productionSiteUrl: "https://lol.example.com/path" }, "production_site_url");
expectNoGo({ productionSiteUrl: "https://user:pass@lol.example.com" }, "production_site_url");
expectNoGo({ productionSiteUrl: "https://127.0.0.1" }, "production_site_url");
expectNoGo({ productionSiteUrl: "https://192.168.1.10" }, "production_site_url");
expectNoGo({ productionSiteUrl: "https://[::1]" }, "production_site_url");
expectNoGo({ productionHost: "" }, "production_host");
expectNoGo({ productionHost: "bad host" }, "production_host");
expectNoGo({ productionUser: "bad user" }, "production_user");
expectNoGo({ productionSshPort: undefined }, "production_ssh_port");
expectNoGo({ productionSshPort: "0" }, "production_ssh_port");
expectNoGo({ productionSshPort: "65536" }, "production_ssh_port");
expectNoGo({ productionAppRoot: undefined }, "production_app_root");
expectNoGo({ productionAppRoot: "relative/path" }, "production_app_root");
expectNoGo({ productionAppRoot: "/var/www/../secret" }, "production_app_root");
expectNoGo({ privateKeyConfigured: false }, "private_key_configured");
expectNoGo({ privateKeyValid: false }, "private_key_valid");
expectNoGo({ knownHostsConfigured: false }, "known_hosts_configured");
expectNoGo({ knownHostsMatch: false }, "known_hosts_match");
expectNoGo({ openIncidentCount: 1 }, "open_incidents");
expectNoGo({ openIncidentCount: "unknown" }, "open_incidents");
expectNoGo({ mode: "post_deploy", postDeploySmokePassed: false }, "post_deploy_smoke");

assert.equal(validateProductionSiteUrl("https://lol.example.com"), null);
assert.match(validateProductionSiteUrl("ftp://lol.example.com"), /HTTPS/);

const markdown = formatReadinessMarkdown(postDeployReport);
assert.match(markdown, /リリース判定: GO/);
assert.match(markdown, /公開後スモークテスト/);
assert.equal(markdown.includes("PRIVATE KEY"), false);
assert.equal(JSON.stringify(postDeployReport).includes("PRIVATE KEY"), false);

console.log("リリース可否判定の正常・異常系テストに成功しました。");
