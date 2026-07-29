import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

const APP_NAME = "lol-type-choice";
const APP_ROOT = "/var/www/lol-type-choice";
const RELEASE_SHA_PATH = `${APP_ROOT}/current/RELEASE_SHA`;
const HEALTH_URL = "http://127.0.0.1:3000/api/health";
const DISK_WARNING_PERCENT = 80;
const DISK_CRITICAL_PERCENT = 90;
const PM2_CANDIDATES = ["/usr/bin/pm2", "/usr/local/bin/pm2"];

const commandEnvironment = () => ({
  HOME: process.env.HOME || "/home/ubuntu",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  PATH: "/usr/local/bin:/usr/bin:/bin"
});

export const runFixedCommand = async (file, args, { timeoutMs = 5_000 } = {}) => {
  try {
    const result = await execFileAsync(file, args, {
      env: commandEnvironment(),
      timeout: timeoutMs,
      maxBuffer: 256 * 1024,
      windowsHide: true
    });

    return {
      ok: true,
      exitCode: 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: Number.isInteger(error?.code) ? error.code : 1,
      stdout: typeof error?.stdout === "string" ? error.stdout : "",
      stderr: typeof error?.stderr === "string" ? error.stderr : ""
    };
  }
};

const safeMessage = (value) => String(value ?? "").replaceAll("\n", " ").slice(0, 300);

const makeCheck = (id, label, status, message, details = {}) => ({
  id,
  label,
  status,
  message: safeMessage(message),
  details
});

const parseProperties = (value) => {
  const properties = {};
  for (const line of value.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    properties[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return properties;
};

const parseDiskUsage = (value) => {
  const lines = value.trim().split(/\r?\n/).filter(Boolean);
  const dataLine = lines.at(-1) ?? "";
  const columns = dataLine.trim().split(/\s+/);
  const percentText = columns.at(-2) ?? "";
  const match = /^(\d{1,3})%$/.exec(percentText);
  if (!match) return null;

  const percent = Number(match[1]);
  return Number.isInteger(percent) && percent >= 0 && percent <= 100 ? percent : null;
};

const findPm2Path = async (fileExists) => {
  for (const candidate of PM2_CANDIDATES) {
    try {
      await fileExists(candidate);
      return candidate;
    } catch {
      // 次の固定候補を確認する。
    }
  }
  return null;
};

const checkNginx = async (runCommand) => {
  const result = await runCommand("/usr/bin/systemctl", ["is-active", "nginx"]);
  const active = result.ok && result.stdout.trim() === "active";
  return makeCheck(
    "nginx",
    "Nginx",
    active ? "healthy" : "critical",
    active ? "Nginxサービスはactiveです。" : "Nginxサービスがactiveではありません。"
  );
};

const checkPm2 = async (runCommand, fileExists) => {
  const pm2Path = await findPm2Path(fileExists);
  if (!pm2Path) {
    return makeCheck("pm2", "PM2アプリ", "critical", "PM2実行ファイルが見つかりません。");
  }

  const result = await runCommand(pm2Path, ["jlist"], { timeoutMs: 8_000 });
  if (!result.ok) {
    return makeCheck("pm2", "PM2アプリ", "critical", "PM2の状態を取得できません。", {
      executable: pm2Path
    });
  }

  try {
    const processes = JSON.parse(result.stdout);
    const target = Array.isArray(processes)
      ? processes.find((process) => process?.name === APP_NAME)
      : null;
    const status = target?.pm2_env?.status;
    const online = status === "online";

    return makeCheck(
      "pm2",
      "PM2アプリ",
      online ? "healthy" : "critical",
      online ? `${APP_NAME}はonlineです。` : `${APP_NAME}がonlineではありません。`,
      { processStatus: typeof status === "string" ? status : "missing" }
    );
  } catch {
    return makeCheck("pm2", "PM2アプリ", "critical", "PM2の状態JSONを解釈できません。");
  }
};

const checkLocalHealth = async (runCommand) => {
  const result = await runCommand("/usr/bin/curl", [
    "--fail",
    "--silent",
    "--show-error",
    "--max-time",
    "5",
    HEALTH_URL
  ]);

  if (!result.ok) {
    return makeCheck("local_health", "ローカルヘルス", "critical", "ローカルヘルスチェックに失敗しました。");
  }

  try {
    const body = JSON.parse(result.stdout);
    const healthy = body?.status === "ok";
    return makeCheck(
      "local_health",
      "ローカルヘルス",
      healthy ? "healthy" : "critical",
      healthy ? "ローカルヘルスチェックは正常です。" : "ローカルヘルスの内容が想定と一致しません。"
    );
  } catch {
    return makeCheck("local_health", "ローカルヘルス", "critical", "ローカルヘルスのJSONを解釈できません。");
  }
};

const checkRelease = async (readTextFile) => {
  try {
    const releaseSha = (await readTextFile(RELEASE_SHA_PATH, "utf8")).trim();
    const valid = /^[0-9a-f]{40}$/.test(releaseSha);
    return makeCheck(
      "release",
      "現在のリリース",
      valid ? "healthy" : "critical",
      valid ? "currentは有効なリリースSHAを参照しています。" : "RELEASE_SHAの形式が不正です。",
      { releaseSha: valid ? releaseSha : null }
    );
  } catch {
    return makeCheck("release", "現在のリリース", "critical", "current/RELEASE_SHAを読み取れません。");
  }
};

const checkDisk = async (runCommand) => {
  const result = await runCommand("/usr/bin/df", ["-P", APP_ROOT]);
  if (!result.ok) {
    return makeCheck("disk", "ディスク使用率", "critical", "アプリ配置先のディスク使用率を取得できません。");
  }

  const usedPercent = parseDiskUsage(result.stdout);
  if (usedPercent === null) {
    return makeCheck("disk", "ディスク使用率", "critical", "ディスク使用率の出力を解釈できません。");
  }

  const status =
    usedPercent >= DISK_CRITICAL_PERCENT
      ? "critical"
      : usedPercent >= DISK_WARNING_PERCENT
        ? "warning"
        : "healthy";

  const message =
    status === "critical"
      ? `ディスク使用率が${usedPercent}%です。直ちに空き容量を確保してください。`
      : status === "warning"
        ? `ディスク使用率が${usedPercent}%です。増加要因を確認してください。`
        : `ディスク使用率は${usedPercent}%です。`;

  return makeCheck("disk", "ディスク使用率", status, message, {
    usedPercent,
    warningPercent: DISK_WARNING_PERCENT,
    criticalPercent: DISK_CRITICAL_PERCENT
  });
};

const checkCertbotTimer = async (runCommand) => {
  const listResult = await runCommand("/usr/bin/systemctl", [
    "list-unit-files",
    "--type=timer",
    "--no-legend",
    "--no-pager"
  ]);

  if (!listResult.ok) {
    return makeCheck("certbot_timer", "Certbot更新タイマー", "critical", "systemd timer一覧を取得できません。");
  }

  const timerUnits = listResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((unit) => unit?.endsWith(".timer") && unit.toLowerCase().includes("certbot"));

  if (timerUnits.length === 0) {
    return makeCheck("certbot_timer", "Certbot更新タイマー", "critical", "Certbot関連のsystemd timerが見つかりません。");
  }

  const timerDetails = [];
  for (const unit of timerUnits) {
    const showResult = await runCommand("/usr/bin/systemctl", [
      "show",
      unit,
      "--property=ActiveState",
      "--property=UnitFileState",
      "--property=LastTriggerUSec",
      "--property=NextElapseUSecRealtime",
      "--no-pager"
    ]);

    if (!showResult.ok) {
      timerDetails.push({ unit, activeState: "unknown", unitFileState: "unknown" });
      continue;
    }

    const properties = parseProperties(showResult.stdout);
    timerDetails.push({
      unit,
      activeState: properties.ActiveState || "unknown",
      unitFileState: properties.UnitFileState || "unknown",
      lastTrigger: properties.LastTriggerUSec || null,
      nextElapse: properties.NextElapseUSecRealtime || null
    });
  }

  const activeTimer = timerDetails.find((timer) => timer.activeState === "active");
  return makeCheck(
    "certbot_timer",
    "Certbot更新タイマー",
    activeTimer ? "healthy" : "critical",
    activeTimer
      ? `${activeTimer.unit}はactiveです。`
      : "Certbot関連timerがactiveではありません。",
    {
      activeUnit: activeTimer?.unit ?? null,
      activeState: activeTimer?.activeState ?? null,
      unitFileState: activeTimer?.unitFileState ?? null,
      lastTrigger: activeTimer?.lastTrigger ?? null,
      nextElapse: activeTimer?.nextElapse ?? null,
      detectedUnits: timerDetails.map((timer) => timer.unit)
    }
  );
};

export const collectVpsOperations = async ({
  runCommand = runFixedCommand,
  readTextFile = readFile,
  fileExists = access,
  now = new Date()
} = {}) => {
  const checks = [];

  checks.push(await checkNginx(runCommand));
  checks.push(await checkPm2(runCommand, fileExists));
  checks.push(await checkLocalHealth(runCommand));
  checks.push(await checkRelease(readTextFile));
  checks.push(await checkDisk(runCommand));
  checks.push(await checkCertbotTimer(runCommand));

  const status = checks.some((check) => check.status === "critical")
    ? "critical"
    : checks.some((check) => check.status === "warning")
      ? "warning"
      : "healthy";

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    status,
    checks
  };
};

const runCli = async () => {
  const report = await collectVpsOperations();
  process.stdout.write(`${JSON.stringify(report)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(() => {
    const fallback = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: "critical",
      checks: [
        makeCheck("observer", "監査スクリプト", "critical", "VPS運用監査スクリプトで予期しないエラーが発生しました。")
      ]
    };
    process.stdout.write(`${JSON.stringify(fallback)}\n`);
  });
}
