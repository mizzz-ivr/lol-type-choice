import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatVpsOperationsMarkdown,
  loadAndNormalizeReport,
  validateVpsOperationsReport
} from "./vps-operations-report.mjs";

const checks = [
  { id: "nginx", label: "Nginx", status: "healthy", message: "active", details: {} },
  { id: "pm2", label: "PM2アプリ", status: "healthy", message: "online", details: {} },
  { id: "local_health", label: "ローカルヘルス", status: "healthy", message: "ok", details: {} },
  {
    id: "release",
    label: "現在のリリース",
    status: "healthy",
    message: "valid",
    details: { releaseSha: "a".repeat(40) }
  },
  {
    id: "disk",
    label: "ディスク使用率",
    status: "healthy",
    message: "42%",
    details: { usedPercent: 42 }
  },
  {
    id: "certbot_timer",
    label: "Certbot更新タイマー",
    status: "healthy",
    message: "active",
    details: { activeUnit: "snap.certbot.renew.timer" }
  }
];

const valid = {
  schemaVersion: 1,
  generatedAt: "2026-07-29T04:00:00.000Z",
  status: "healthy",
  checks
};

const normalized = validateVpsOperationsReport(valid);
assert.equal(normalized.status, "healthy");
assert.equal(normalized.checks.length, 6);

const markdown = formatVpsOperationsMarkdown(normalized);
assert.match(markdown, /VPS運用監査結果/);
assert.match(markdown, /Certbot更新タイマー/);
assert.equal(markdown.includes("PRIVATE KEY"), false);

assert.throws(
  () => validateVpsOperationsReport({ ...valid, schemaVersion: 2 }),
  /schemaVersion/
);
assert.throws(
  () => validateVpsOperationsReport({ ...valid, status: "warning" }),
  /全体status/
);
assert.throws(
  () => validateVpsOperationsReport({ ...valid, checks: checks.slice(0, 5) }),
  /必須監査項目/
);
assert.throws(
  () => validateVpsOperationsReport({ ...valid, checks: [...checks, checks[0]] }),
  /重複/
);
assert.throws(
  () => validateVpsOperationsReport({ ...valid, checks: [{ id: "unknown", label: "x", status: "healthy" }] }),
  /未対応/
);

const directory = await mkdtemp(join(tmpdir(), "vps-report-"));
const reportPath = join(directory, "report.json");

await writeFile(reportPath, JSON.stringify(valid));
const loaded = await loadAndNormalizeReport({ reportPath, sshSucceeded: true });
assert.equal(loaded.status, "healthy");

await writeFile(reportPath, "not-json");
const invalidJson = await loadAndNormalizeReport({ reportPath, sshSucceeded: true });
assert.equal(invalidJson.status, "critical");
assert.equal(invalidJson.checks[0].id, "report_validation");
assert.equal(JSON.stringify(invalidJson).includes("not-json"), false);

const sshFailure = await loadAndNormalizeReport({ reportPath, sshSucceeded: false });
assert.equal(sshFailure.status, "critical");
assert.match(sshFailure.checks[0].message, /SSH/);

const warning = validateVpsOperationsReport({
  ...valid,
  status: "warning",
  checks: checks.map((check) =>
    check.id === "disk" ? { ...check, status: "warning", message: "85%" } : check
  )
});
assert.equal(warning.status, "warning");

console.log("VPS運用監査レポートの検証テストに成功しました。");
