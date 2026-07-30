import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MAX_ITEMS = 10000;
const MAX_REF_LENGTH = 500;
const PACKAGE_NAME_PATTERN = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/;
const VERSION_PATTERN = /^[0-9A-Za-z.+_:-]+$/;
const PROPERTY_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/;

const safeRef = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.replaceAll("\n", " ").replaceAll("\r", " ").trim();
  return normalized && normalized.length <= MAX_REF_LENGTH ? normalized : null;
};

const safeComponentLabel = (component) => {
  const name = typeof component?.name === "string" ? component.name.trim() : "";
  const version = typeof component?.version === "string" ? component.version.trim() : "";
  return PACKAGE_NAME_PATTERN.test(name) && VERSION_PATTERN.test(version)
    ? `${name}@${version}`
    : "不明なコンポーネント";
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
};

const stableJson = (value) => JSON.stringify(canonicalize(value));

const differingKeys = (left, right) =>
  [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])]
    .filter((key) => stableJson(left?.[key]) !== stableJson(right?.[key]))
    .filter((key) => PROPERTY_NAME_PATTERN.test(key))
    .sort()
    .slice(0, 20);

const differingPropertyNames = (left, right) => {
  const names = [];
  for (const property of [
    ...(Array.isArray(left?.properties) ? left.properties : []),
    ...(Array.isArray(right?.properties) ? right.properties : [])
  ]) {
    const name = typeof property?.name === "string" ? property.name.trim() : "";
    if (name && name.length <= 100 && PROPERTY_NAME_PATTERN.test(name)) names.push(name);
  }
  return [...new Set(names)].sort().slice(0, 20);
};

const deduplicateComponents = (components) => {
  if (!Array.isArray(components) || components.length === 0 || components.length > MAX_ITEMS) {
    throw new Error("CycloneDXコンポーネントの件数が不正です。");
  }

  const unique = new Map();
  let duplicates = 0;

  for (const component of components) {
    if (!component || typeof component !== "object" || Array.isArray(component)) {
      throw new Error("CycloneDXコンポーネントの形式が不正です。");
    }
    const ref = safeRef(component["bom-ref"]);
    if (!ref) throw new Error("CycloneDXコンポーネントに有効なbom-refがありません。");

    const existing = unique.get(ref);
    if (!existing) {
      unique.set(ref, component);
      continue;
    }
    if (stableJson(existing) !== stableJson(component)) {
      const keys = differingKeys(existing, component);
      const propertyNames = differingPropertyNames(existing, component);
      throw new Error(
        `同じbom-refを持つ${safeComponentLabel(component)}の内容が競合しています。差分項目: ${keys.join(", ") || "不明"}${propertyNames.length > 0 ? ` / プロパティ: ${propertyNames.join(", ")}` : ""}`
      );
    }
    duplicates += 1;
  }

  return { values: [...unique.values()], duplicates };
};

const normalizedDependency = (dependency) => {
  if (!dependency || typeof dependency !== "object" || Array.isArray(dependency)) {
    throw new Error("CycloneDX依存関係の形式が不正です。");
  }
  const ref = safeRef(dependency.ref);
  if (!ref) throw new Error("CycloneDX依存関係に有効なrefがありません。");
  if (!Array.isArray(dependency.dependsOn)) {
    throw new Error("CycloneDX依存関係のdependsOnが不正です。");
  }

  const dependsOn = dependency.dependsOn.map((target) => {
    const normalized = safeRef(target);
    if (!normalized) throw new Error("CycloneDX依存関係の参照先が不正です。");
    return normalized;
  });

  return {
    ...dependency,
    ref,
    dependsOn: [...new Set(dependsOn)].sort()
  };
};

const deduplicateDependencies = (dependencies) => {
  if (!Array.isArray(dependencies) || dependencies.length === 0 || dependencies.length > MAX_ITEMS) {
    throw new Error("CycloneDX依存関係の件数が不正です。");
  }

  const unique = new Map();
  let duplicates = 0;

  for (const rawDependency of dependencies) {
    const dependency = normalizedDependency(rawDependency);
    const existing = unique.get(dependency.ref);
    if (!existing) {
      unique.set(dependency.ref, dependency);
      continue;
    }
    if (stableJson(existing) !== stableJson(dependency)) {
      throw new Error("同じrefを持つCycloneDX依存関係の内容が競合しています。");
    }
    duplicates += 1;
  }

  return { values: [...unique.values()], duplicates };
};

export const normalizeNpmCycloneDx = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("CycloneDX SBOMがJSONオブジェクトではありません。");
  }
  if (input.bomFormat !== "CycloneDX") {
    throw new Error("npm生成SBOMがCycloneDX形式ではありません。");
  }

  const components = deduplicateComponents(input.components);
  const dependencies = deduplicateDependencies(input.dependencies);

  return {
    sbom: {
      ...input,
      components: components.values,
      dependencies: dependencies.values
    },
    stats: {
      removedDuplicateComponents: components.duplicates,
      removedDuplicateDependencies: dependencies.duplicates
    }
  };
};

const runCli = async () => {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error("入力SBOMと出力先を指定してください。");
  }

  let input;
  try {
    input = JSON.parse(await readFile(inputPath, "utf8"));
  } catch {
    throw new Error("npm生成SBOMを安全に読み取れませんでした。");
  }

  const normalized = normalizeNpmCycloneDx(input);
  await writeFile(outputPath, `${JSON.stringify(normalized.sbom, null, 2)}\n`, { mode: 0o600 });
  console.log(
    `npm生成SBOMを正規化しました: 重複コンポーネント ${normalized.stats.removedDuplicateComponents}件 / 重複依存参照 ${normalized.stats.removedDuplicateDependencies}件`
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : "npm生成SBOMの正規化に失敗しました。");
    process.exitCode = 1;
  });
}
