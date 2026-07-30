import { readFile } from "node:fs/promises";

const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const VALID_SEVERITIES = new Set(SEVERITIES);
const VALID_SCOPES = new Set(["production", "development"]);
const PACKAGE_NAME_PATTERN = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/;
const VERSION_PATTERN = /^[0-9A-Za-z.+_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEPENDENCY_CHECK_IDS = new Set([
  "production_dependencies",
  "development_dependencies",
  "all_dependencies",
  "dependency_exceptions"
]);

const cloneCounts = (counts) =>
  Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value]));

const recalculateTotal = (counts) => {
  counts.total = SEVERITIES.reduce((sum, severity) => sum + counts[severity], 0);
};

const decrement = (counts, severity) => {
  counts[severity] = Math.max((counts[severity] ?? 0) - 1, 0);
  recalculateTotal(counts);
};

const statusFromSummary = (summary) => {
  if (
    summary.production.high > 0 ||
    summary.production.critical > 0 ||
    summary.all.critical > 0
  ) {
    return "critical";
  }
  if (
    summary.production.moderate > 0 ||
    summary.all.high > 0 ||
    summary.all.moderate > 0
  ) {
    return "warning";
  }
  return "healthy";
};

const statusForCounts = (counts, scope) => {
  if (counts.critical > 0 || (scope === "production" && counts.high > 0)) {
    return "critical";
  }
  if (counts.high > 0 || counts.moderate > 0) return "warning";
  return "healthy";
};

const countMessage = (counts) =>
  `critical ${counts.critical}件 / high ${counts.high}件 / moderate ${counts.moderate}件 / low ${counts.low}件`;

const normalizeReason = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.replaceAll("\n", " ").trim();
  return normalized.length >= 20 && normalized.length <= 300 ? normalized : null;
};

const validateDate = (value) => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

export const validateDependencyAuditExceptions = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("依存関係監査例外がJSONオブジェクトではありません。");
  }
  if (input.schemaVersion !== 1 || !Array.isArray(input.exceptions)) {
    throw new Error("依存関係監査例外のschemaVersionまたはexceptionsが不正です。");
  }

  const seen = new Set();
  return input.exceptions.map((exception) => {
    if (!exception || typeof exception !== "object" || Array.isArray(exception)) {
      throw new Error("依存関係監査例外の形式が不正です。");
    }
    if (!PACKAGE_NAME_PATTERN.test(exception.package)) {
      throw new Error("依存関係監査例外のpackageが不正です。");
    }
    if (!VALID_SEVERITIES.has(exception.severity) || !VALID_SCOPES.has(exception.scope)) {
      throw new Error("依存関係監査例外のseverityまたはscopeが不正です。");
    }
    if (!VERSION_PATTERN.test(exception.installedVersion)) {
      throw new Error("依存関係監査例外のinstalledVersionが不正です。");
    }
    if (!validateDate(exception.expiresOn)) {
      throw new Error("依存関係監査例外のexpiresOnが不正です。");
    }
    const reason = normalizeReason(exception.reason);
    if (!reason) {
      throw new Error("依存関係監査例外のreasonが不正です。");
    }

    const key = `${exception.package}:${exception.severity}:${exception.scope}:${exception.installedVersion}`;
    if (seen.has(key)) throw new Error("依存関係監査例外が重複しています。");
    seen.add(key);

    return {
      package: exception.package,
      severity: exception.severity,
      scope: exception.scope,
      installedVersion: exception.installedVersion,
      expiresOn: exception.expiresOn,
      reason
    };
  });
};

const installedVersionFor = (lockfile, packageName) => {
  const entry = lockfile?.packages?.[`node_modules/${packageName}`];
  return typeof entry?.version === "string" ? entry.version : null;
};

const makeExceptionCheck = (status, message, details = {}) => ({
  id: "dependency_exceptions",
  label: "期限付き監査例外",
  status,
  message,
  details
});

export const applyDependencyAuditExceptions = ({
  report,
  exceptionsConfig,
  packageLock,
  now = new Date()
}) => {
  const exceptions = validateDependencyAuditExceptions(exceptionsConfig);
  const detectedSummary = {
    all: cloneCounts(report.summary.all),
    production: cloneCounts(report.summary.production),
    developmentOnly: cloneCounts(report.summary.developmentOnly)
  };
  const effectiveSummary = {
    all: cloneCounts(report.summary.all),
    production: cloneCounts(report.summary.production),
    developmentOnly: cloneCounts(report.summary.developmentOnly)
  };
  const vulnerablePackages = report.vulnerablePackages.map((item) => ({ ...item }));
  const acceptedExceptions = [];
  const exceptionProblems = [];
  const today = now.toISOString().slice(0, 10);
  const nonDependencyCritical = report.checks.some(
    (check) => check.status === "critical" && !DEPENDENCY_CHECK_IDS.has(check.id)
  );

  for (const exception of exceptions) {
    const installedVersion = installedVersionFor(packageLock, exception.package);
    if (installedVersion !== exception.installedVersion) {
      exceptionProblems.push({
        status: "critical",
        message: `${exception.package}の導入バージョンが例外条件と一致しません。`
      });
      continue;
    }
    if (exception.expiresOn < today) {
      exceptionProblems.push({
        status: "critical",
        message: `${exception.package}の監査例外は${exception.expiresOn}に期限切れです。`
      });
      continue;
    }

    const target = vulnerablePackages.find(
      (item) =>
        item.name === exception.package &&
        item.severity === exception.severity &&
        item.scope === exception.scope &&
        item.exception == null
    );

    if (!target) {
      exceptionProblems.push({
        status: "warning",
        message: `${exception.package}の監査例外に対応する脆弱性が検出されませんでした。例外削除を確認してください。`
      });
      continue;
    }

    target.exception = {
      installedVersion: exception.installedVersion,
      expiresOn: exception.expiresOn,
      reason: exception.reason
    };
    decrement(effectiveSummary.all, exception.severity);
    decrement(
      exception.scope === "production"
        ? effectiveSummary.production
        : effectiveSummary.developmentOnly,
      exception.severity
    );
    acceptedExceptions.push({ ...exception });
  }

  let status = statusFromSummary(effectiveSummary);
  if (
    nonDependencyCritical ||
    exceptionProblems.some((problem) => problem.status === "critical")
  ) {
    status = "critical";
  } else if (
    status === "healthy" &&
    exceptionProblems.some((problem) => problem.status === "warning")
  ) {
    status = "warning";
  }

  const checks = report.checks
    .filter((check) => check.id !== "dependency_exceptions")
    .map((check) => {
      if (check.id === "production_dependencies") {
        return {
          ...check,
          status: statusForCounts(effectiveSummary.production, "production"),
          message: countMessage(effectiveSummary.production),
          details: { ...effectiveSummary.production }
        };
      }
      if (check.id === "development_dependencies") {
        return {
          ...check,
          status: statusForCounts(effectiveSummary.developmentOnly, "development"),
          message: countMessage(effectiveSummary.developmentOnly),
          details: { ...effectiveSummary.developmentOnly }
        };
      }
      if (check.id === "all_dependencies") {
        return {
          ...check,
          status:
            effectiveSummary.all.critical > 0
              ? "critical"
              : effectiveSummary.all.high > 0 || effectiveSummary.all.moderate > 0
                ? "warning"
                : "healthy",
          message: countMessage(effectiveSummary.all),
          details: { ...effectiveSummary.all }
        };
      }
      return check;
    });

  if (exceptions.length > 0) {
    const problemStatus = exceptionProblems.some((problem) => problem.status === "critical")
      ? "critical"
      : exceptionProblems.length > 0
        ? "warning"
        : "healthy";
    const message =
      exceptionProblems.length > 0
        ? exceptionProblems.map((problem) => problem.message).join(" ").slice(0, 500)
        : `${acceptedExceptions.length}件の期限付き例外を適用しました。最短期限: ${acceptedExceptions
            .map((exception) => exception.expiresOn)
            .sort()[0]}`;
    checks.push(
      makeExceptionCheck(problemStatus, message, {
        accepted: acceptedExceptions.length,
        problems: exceptionProblems.length
      })
    );
  }

  return {
    ...report,
    status,
    detectedSummary,
    summary: effectiveSummary,
    vulnerablePackages,
    acceptedExceptions,
    checks
  };
};

export const loadAndApplyDependencyAuditExceptions = async ({
  report,
  exceptionsPath,
  packageLockPath,
  now = new Date()
}) => {
  try {
    const [exceptionsConfig, packageLock] = await Promise.all([
      readFile(exceptionsPath, "utf8").then(JSON.parse),
      readFile(packageLockPath, "utf8").then(JSON.parse)
    ]);
    return applyDependencyAuditExceptions({ report, exceptionsConfig, packageLock, now });
  } catch {
    return {
      ...report,
      status: "critical",
      acceptedExceptions: [],
      checks: [
        ...report.checks,
        makeExceptionCheck("critical", "依存関係監査例外を安全に検証できませんでした。")
      ]
    };
  }
};
