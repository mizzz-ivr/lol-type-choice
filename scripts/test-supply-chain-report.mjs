import assert from "node:assert/strict";
import {
  buildSupplyChainReport,
  formatSupplyChainMarkdown,
  validateCycloneDxSbom
} from "./supply-chain-report.mjs";

const component = ({
  name,
  version = "1.0.0",
  bomRef = `${name}@${version}`,
  purl = `pkg:npm/${encodeURIComponent(name)}@${version}`,
  licenses = [{ license: { id: "MIT" } }]
}) => ({
  type: "library",
  name,
  version,
  "bom-ref": bomRef,
  ...(purl ? { purl } : {}),
  licenses
});

const sbom = ({ components, rootDependsOn, specVersion = "1.5", bomFormat = "CycloneDX" }) => ({
  bomFormat,
  specVersion,
  metadata: {
    component: {
      type: "application",
      name: "lol-type-choice",
      version: "0.1.0",
      "bom-ref": "pkg:npm/lol-type-choice@0.1.0",
      purl: "pkg:npm/lol-type-choice@0.1.0"
    }
  },
  components,
  dependencies: [
    { ref: "pkg:npm/lol-type-choice@0.1.0", dependsOn: rootDependsOn },
    ...components.map((item) => ({ ref: item["bom-ref"], dependsOn: [] }))
  ]
});

const next = component({ name: "next", version: "15.5.22" });
const react = component({ name: "react", version: "19.0.0" });
const reactDom = component({ name: "react-dom", version: "19.0.0" });
const vitest = component({ name: "vitest", version: "3.2.7" });

const production = sbom({
  components: [next, react, reactDom],
  rootDependsOn: [next["bom-ref"], react["bom-ref"], reactDom["bom-ref"]]
});
const all = sbom({
  components: [next, react, reactDom, vitest],
  rootDependsOn: [next["bom-ref"], react["bom-ref"], reactDom["bom-ref"], vitest["bom-ref"]]
});
const packageJson = {
  dependencies: { next: "15.5.22", react: "19.0.0", "react-dom": "19.0.0" }
};

const ready = buildSupplyChainReport({
  allSbom: all,
  productionSbom: production,
  packageJson,
  generatedAt: "2026-07-30T00:00:00.000Z",
  commitSha: "a".repeat(40)
});
assert.equal(ready.status, "ready");
assert.equal(ready.summary.allComponents, 4);
assert.equal(ready.summary.productionComponents, 3);
assert.equal(ready.summary.developmentOnlyComponents, 1);
assert.equal(ready.summary.missingLicense, 0);
assert.equal(ready.commitSha, "a".repeat(40));
assert.match(formatSupplyChainMarkdown(ready), /確認完了/);

const warningComponent = component({
  name: "license-name-only",
  purl: null,
  licenses: [{ license: { name: "Custom License" } }]
});
const expressionComponent = component({
  name: "dual-license",
  version: "2.0.0",
  licenses: [{ expression: "MIT OR Apache-2.0" }]
});
const unknownComponent = component({ name: "unknown-license", licenses: [] });
const duplicateVersion = component({ name: "react", version: "18.3.1", bomRef: "react@18.3.1" });
const warningAll = sbom({
  components: [
    next,
    react,
    reactDom,
    warningComponent,
    expressionComponent,
    unknownComponent,
    duplicateVersion
  ],
  rootDependsOn: [next["bom-ref"], react["bom-ref"], reactDom["bom-ref"]]
});
const warningReport = buildSupplyChainReport({
  allSbom: warningAll,
  productionSbom: production,
  packageJson,
  generatedAt: "2026-07-30T00:00:00.000Z"
});
assert.equal(warningReport.status, "review_required");
assert.equal(warningReport.summary.missingLicense, 1);
assert.equal(warningReport.summary.namedLicense, 1);
assert.equal(warningReport.summary.licenseExpression, 1);
assert.equal(warningReport.summary.missingPurl, 1);
assert.equal(warningReport.summary.multipleVersions, 1);
assert.match(formatSupplyChainMarkdown(warningReport), /自動拒否はせず/);

assert.throws(() => validateCycloneDxSbom({ ...all, bomFormat: "SPDX" }), /CycloneDX/);

const duplicateBomRef = structuredClone(all);
duplicateBomRef.components[1]["bom-ref"] = duplicateBomRef.components[0]["bom-ref"];
assert.throws(() => validateCycloneDxSbom(duplicateBomRef), /重複したbom-ref/);

const invalidDependency = structuredClone(all);
invalidDependency.dependencies[0].dependsOn.push("missing-ref");
assert.throws(() => validateCycloneDxSbom(invalidDependency), /dependsOn参照/);

const missingDirectProduction = structuredClone(production);
missingDirectProduction.dependencies[0].dependsOn = [next["bom-ref"], react["bom-ref"]];
assert.throws(
  () =>
    buildSupplyChainReport({
      allSbom: all,
      productionSbom: missingDirectProduction,
      packageJson
    }),
  /react-dom/
);

const productionOnlyComponent = component({ name: "production-only" });
const invalidProduction = sbom({
  components: [next, react, reactDom, productionOnlyComponent],
  rootDependsOn: [next["bom-ref"], react["bom-ref"], reactDom["bom-ref"]]
});
assert.throws(
  () => buildSupplyChainReport({ allSbom: all, productionSbom: invalidProduction, packageJson }),
  /存在しないコンポーネント/
);

const tooManyProductionComponents = sbom({
  components: [next, react, reactDom, vitest, component({ name: "extra" })],
  rootDependsOn: [next["bom-ref"], react["bom-ref"], reactDom["bom-ref"]]
});
assert.throws(
  () =>
    buildSupplyChainReport({
      allSbom: all,
      productionSbom: tooManyProductionComponents,
      packageJson
    }),
  /コンポーネント数/
);

console.log("SBOM・依存ライセンスレポートのテストに成功しました。");
