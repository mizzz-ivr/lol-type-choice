import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PACKAGE_NAME_PATTERN = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/;
const VERSION_PATTERN = /^[0-9A-Za-z.+_:-]+$/;
const PURL_PATTERN = /^pkg:npm\//;
const SPEC_VERSION_PATTERN = /^1\.[4-9]$/;
const SPDX_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
const MAX_COMPONENTS = 5000;
const MAX_TEXT_LENGTH = 200;

const safeText = (value, maxLength = MAX_TEXT_LENGTH) => {
  if (typeof value !== "string") return null;
  const normalized = value.replaceAll("\n", " ").replaceAll("\r", " ").trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};

const componentIdentity = (component) => {
  const purl = safeText(component?.purl, 500);
  if (purl && PURL_PATTERN.test(purl)) return purl;

  const name = safeText(component?.name);
  const version = safeText(component?.version);
  if (!name || !PACKAGE_NAME_PATTERN.test(name) || !version || !VERSION_PATTERN.test(version)) {
    throw new Error("SBOMコンポーネントの識別情報が不正です。");
  }
  return `${name}@${version}`;
};

const normalizeComponent = (component) => {
  if (!component || typeof component !== "object" || Array.isArray(component)) {
    throw new Error("SBOMコンポーネントの形式が不正です。");
  }

  const name = safeText(component.name);
  const version = safeText(component.version);
  const bomRef = safeText(component["bom-ref"], 500);
  const purl = safeText(component.purl, 500);

  if (!name || !PACKAGE_NAME_PATTERN.test(name)) {
    throw new Error("SBOMコンポーネント名が不正です。");
  }
  if (!version || !VERSION_PATTERN.test(version)) {
    throw new Error("SBOMコンポーネントのバージョンが不正です。");
  }
  if (!bomRef) {
    throw new Error("SBOMコンポーネントにbom-refがありません。");
  }
  if (purl && !PURL_PATTERN.test(purl)) {
    throw new Error("SBOMコンポーネントのPURL形式が不正です。");
  }

  return {
    name,
    version,
    bomRef,
    purl,
    identity: componentIdentity(component),
    licenses: Array.isArray(component.licenses) ? component.licenses : []
  };
};

const validateDependencyGraph = (dependencies, validRefs, rootRef) => {
  if (!Array.isArray(dependencies) || dependencies.length === 0) {
    throw new Error("SBOMの依存関係情報がありません。");
  }

  const seen = new Set();
  let rootDependency = null;

  for (const dependency of dependencies) {
    if (!dependency || typeof dependency !== "object" || Array.isArray(dependency)) {
      throw new Error("SBOM依存関係の形式が不正です。");
    }
    const ref = safeText(dependency.ref, 500);
    if (!ref || !validRefs.has(ref)) {
      throw new Error("SBOM依存関係の参照先が不正です。");
    }
    if (seen.has(ref)) {
      throw new Error("SBOM依存関係に重複したrefがあります。");
    }
    seen.add(ref);

    if (!Array.isArray(dependency.dependsOn)) {
      throw new Error("SBOM依存関係のdependsOnが不正です。");
    }
    for (const target of dependency.dependsOn) {
      if (typeof target !== "string" || !validRefs.has(target)) {
        throw new Error("SBOM依存関係のdependsOn参照が不正です。");
      }
    }

    if (ref === rootRef) rootDependency = dependency;
  }

  if (!rootDependency) {
    throw new Error("SBOMにルート依存関係がありません。");
  }

  return rootDependency;
};

export const validateCycloneDxSbom = (input, label = "SBOM") => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label}がJSONオブジェクトではありません。`);
  }
  if (input.bomFormat !== "CycloneDX" || !SPEC_VERSION_PATTERN.test(input.specVersion ?? "")) {
    throw new Error(`${label}のCycloneDX形式または仕様バージョンが不正です。`);
  }

  const root = normalizeComponent(input.metadata?.component);
  const components = input.components;
  if (!Array.isArray(components) || components.length === 0 || components.length > MAX_COMPONENTS) {
    throw new Error(`${label}のコンポーネント件数が不正です。`);
  }

  const normalizedComponents = components.map(normalizeComponent);
  const refs = new Set([root.bomRef]);
  for (const component of normalizedComponents) {
    if (refs.has(component.bomRef)) {
      throw new Error(`${label}に重複したbom-refがあります。`);
    }
    refs.add(component.bomRef);
  }

  const rootDependency = validateDependencyGraph(input.dependencies, refs, root.bomRef);
  return { root, components: normalizedComponents, rootDependency };
};

const normalizeLicenseEntry = (entry) => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  const expression = safeText(entry.expression);
  if (expression) {
    return { label: expression, kind: "expression" };
  }

  const id = safeText(entry.license?.id);
  if (id && SPDX_ID_PATTERN.test(id)) {
    return { label: id, kind: "spdx" };
  }

  const name = safeText(entry.license?.name);
  if (name) {
    return { label: name, kind: "name" };
  }

  return null;
};

const normalizeLicenses = (component) => {
  const licenses = component.licenses.map(normalizeLicenseEntry).filter(Boolean);
  if (licenses.length === 0) return [{ label: "UNKNOWN", kind: "unknown" }];

  const unique = new Map();
  for (const license of licenses) {
    unique.set(`${license.kind}:${license.label}`, license);
  }
  return [...unique.values()].sort((left, right) => left.label.localeCompare(right.label));
};

const directDependencyNames = (validated) => {
  const componentsByRef = new Map(validated.components.map((component) => [component.bomRef, component]));
  return new Set(
    validated.rootDependency.dependsOn
      .map((ref) => componentsByRef.get(ref)?.name)
      .filter(Boolean)
  );
};

const countBy = (values) => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
};

const summarizeWarnings = (components) => {
  const versionsByName = new Map();
  for (const component of components) {
    const versions = versionsByName.get(component.name) ?? new Set();
    versions.add(component.version);
    versionsByName.set(component.name, versions);
  }

  return {
    missingLicense: components.filter((component) =>
      component.licenses.some((license) => license.kind === "unknown")
    ).length,
    namedLicense: components.filter((component) =>
      component.licenses.some((license) => license.kind === "name")
    ).length,
    licenseExpression: components.filter((component) =>
      component.licenses.some((license) => license.kind === "expression")
    ).length,
    missingPurl: components.filter((component) => !component.purl).length,
    multipleVersions: [...versionsByName.values()].filter((versions) => versions.size > 1).length
  };
};

const hasWarnings = (warnings) => Object.values(warnings).some((count) => count > 0);

export const buildSupplyChainReport = ({
  allSbom,
  productionSbom,
  packageJson,
  generatedAt = new Date().toISOString(),
  commitSha = null
}) => {
  const all = validateCycloneDxSbom(allSbom, "全依存関係SBOM");
  const production = validateCycloneDxSbom(productionSbom, "本番依存関係SBOM");

  if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson)) {
    throw new Error("package.jsonの形式が不正です。");
  }

  const expectedProductionDependencies = Object.keys(packageJson.dependencies ?? {});
  if (expectedProductionDependencies.length === 0) {
    throw new Error("package.jsonに本番依存関係がありません。");
  }

  const directProductionNames = directDependencyNames(production);
  for (const dependencyName of expectedProductionDependencies) {
    if (!directProductionNames.has(dependencyName)) {
      throw new Error(`本番SBOMに直接依存${dependencyName}がありません。`);
    }
  }

  const allIdentities = new Set(all.components.map((component) => component.identity));
  const productionIdentities = new Set(production.components.map((component) => component.identity));
  if (productionIdentities.size > allIdentities.size) {
    throw new Error("本番SBOMのコンポーネント数が全依存関係SBOMを超えています。");
  }
  for (const identity of productionIdentities) {
    if (!allIdentities.has(identity)) {
      throw new Error("本番SBOMに全依存関係SBOMへ存在しないコンポーネントがあります。");
    }
  }

  const components = all.components.map((component) => ({
    name: component.name,
    version: component.version,
    purl: component.purl,
    scope: productionIdentities.has(component.identity) ? "production" : "development",
    licenses: normalizeLicenses(component)
  }));

  const warnings = summarizeWarnings(components);
  const licenseCounts = countBy(
    components.flatMap((component) => component.licenses.map((license) => license.label))
  );
  const productionComponents = components.filter((component) => component.scope === "production");
  const productionLicenseCounts = countBy(
    productionComponents.flatMap((component) => component.licenses.map((license) => license.label))
  );

  const normalizedCommit =
    typeof commitSha === "string" && /^[0-9a-f]{40}$/.test(commitSha) ? commitSha : null;

  return {
    schemaVersion: 1,
    generatedAt,
    commitSha: normalizedCommit,
    status: hasWarnings(warnings) ? "review_required" : "ready",
    summary: {
      allComponents: components.length,
      productionComponents: productionComponents.length,
      developmentOnlyComponents: components.length - productionComponents.length,
      ...warnings
    },
    licenses: {
      all: licenseCounts,
      production: productionLicenseCounts
    },
    components: components.sort(
      (left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version)
    )
  };
};

const escapeMarkdown = (value) =>
  String(value).replaceAll("|", "\\|").replaceAll("\n", " ");

export const formatSupplyChainMarkdown = (report) => {
  const statusLabel = report.status === "ready" ? "確認完了" : "レビュー対象あり";
  const lines = [
    "## SBOM・依存ライセンス棚卸し",
    "",
    `- 判定: **${statusLabel}**`,
    `- 生成日時: ${report.generatedAt}`,
    `- Commit: ${report.commitSha ? `\`${report.commitSha}\`` : "-"}`,
    "",
    "| 項目 | 件数 |",
    "|---|---:|",
    `| 全依存コンポーネント | ${report.summary.allComponents} |`,
    `| 本番コンポーネント | ${report.summary.productionComponents} |`,
    `| 開発のみコンポーネント | ${report.summary.developmentOnlyComponents} |`,
    `| ライセンス情報なし | ${report.summary.missingLicense} |`,
    `| SPDX IDではなく名称のみ | ${report.summary.namedLicense} |`,
    `| 複合ライセンス式 | ${report.summary.licenseExpression} |`,
    `| PURLなし | ${report.summary.missingPurl} |`,
    `| 複数バージョン併存パッケージ | ${report.summary.multipleVersions} |`,
    "",
    "### 本番依存関係のライセンス集計",
    "",
    "| ライセンス | 件数 |",
    "|---|---:|"
  ];

  if (report.licenses.production.length === 0) {
    lines.push("| - | 0 |");
  } else {
    for (const item of report.licenses.production.slice(0, 100)) {
      lines.push(`| ${escapeMarkdown(item.label)} | ${item.count} |`);
    }
  }

  if (report.status === "review_required") {
    lines.push(
      "",
      "> ライセンス情報の欠落・名称表記・複合式などを検出しています。自動拒否はせず、ArtifactのJSONで対象コンポーネントを確認してください。"
    );
  }

  return `${lines.join("\n")}\n`;
};

const readJson = async (path, label) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`${label}を安全に読み取れませんでした。`);
  }
};

const runCli = async () => {
  const allSbomPath =
    process.env.SUPPLY_CHAIN_ALL_SBOM_PATH || "supply-chain/sbom-all.cdx.json";
  const productionSbomPath =
    process.env.SUPPLY_CHAIN_PRODUCTION_SBOM_PATH ||
    "supply-chain/sbom-production.cdx.json";
  const packageJsonPath = process.env.SUPPLY_CHAIN_PACKAGE_JSON_PATH || "package.json";
  const reportPath =
    process.env.SUPPLY_CHAIN_REPORT_PATH || "supply-chain/dependency-license-report.json";
  const markdownPath =
    process.env.SUPPLY_CHAIN_MARKDOWN_PATH || "supply-chain/dependency-license-report.md";

  const [allSbom, productionSbom, packageJson] = await Promise.all([
    readJson(allSbomPath, "全依存関係SBOM"),
    readJson(productionSbomPath, "本番依存関係SBOM"),
    readJson(packageJsonPath, "package.json")
  ]);

  const report = buildSupplyChainReport({
    allSbom,
    productionSbom,
    packageJson,
    commitSha: process.env.GITHUB_SHA ?? null
  });
  const markdown = formatSupplyChainMarkdown(report);

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(markdownPath, markdown, { mode: 0o600 });
  process.stdout.write(markdown);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : "SBOMレポート生成に失敗しました。");
    process.exitCode = 1;
  });
}
