import { readFile } from "node:fs/promises";

const PACKAGE_NAME_PATTERN = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/;
const VERSION_PATTERN = /^[0-9A-Za-z.+_:-]+$/;

const safeComponent = (component) => {
  const name = typeof component?.name === "string" ? component.name.trim() : "";
  const version = typeof component?.version === "string" ? component.version.trim() : "";
  const bomRef = typeof component?.["bom-ref"] === "string" ? component["bom-ref"].trim() : "";
  if (!PACKAGE_NAME_PATTERN.test(name) || !VERSION_PATTERN.test(version) || !bomRef) return null;
  return { name, version, bomRef };
};

const path = process.argv[2];
if (!path) process.exit(0);

try {
  const input = JSON.parse(await readFile(path, "utf8"));
  const root = safeComponent(input?.metadata?.component);
  const seen = new Map();
  if (root) seen.set(root.bomRef, { ...root, source: "root" });

  for (const rawComponent of Array.isArray(input?.components) ? input.components : []) {
    const component = safeComponent(rawComponent);
    if (!component) continue;
    const existing = seen.get(component.bomRef);
    if (existing) {
      console.log(
        `重複参照診断: ${component.name}@${component.version} / 先行=${existing.source} / 同一識別=${existing.name === component.name && existing.version === component.version}`
      );
      continue;
    }
    seen.set(component.bomRef, { ...component, source: "component" });
  }
} catch {
  console.log("重複参照診断: SBOMを安全に解析できませんでした。");
}
