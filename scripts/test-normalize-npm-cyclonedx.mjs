import assert from "node:assert/strict";
import { normalizeNpmCycloneDx } from "./normalize-npm-cyclonedx.mjs";

const component = ({
  name = "debug",
  version = "3.2.7",
  bomRef = `pkg:npm/${name}@${version}`,
  license = "MIT"
} = {}) => ({
  type: "library",
  name,
  version,
  "bom-ref": bomRef,
  purl: `pkg:npm/${name}@${version}`,
  licenses: [{ license: { id: license } }]
});

const dependency = ({ ref, dependsOn = [] }) => ({ ref, dependsOn });

const duplicateComponent = component();
const input = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  metadata: {
    component: component({ name: "app", version: "1.0.0", bomRef: "app@1.0.0" })
  },
  components: [
    duplicateComponent,
    structuredClone(duplicateComponent),
    component({ name: "semver", version: "6.3.1" })
  ],
  dependencies: [
    dependency({ ref: "app@1.0.0", dependsOn: ["pkg:npm/debug@3.2.7", "pkg:npm/semver@6.3.1"] }),
    dependency({ ref: "pkg:npm/debug@3.2.7", dependsOn: ["pkg:npm/semver@6.3.1"] }),
    dependency({ ref: "pkg:npm/debug@3.2.7", dependsOn: ["pkg:npm/semver@6.3.1"] }),
    dependency({ ref: "pkg:npm/semver@6.3.1", dependsOn: [] })
  ]
};

const normalized = normalizeNpmCycloneDx(input);
assert.equal(normalized.sbom.components.length, 2);
assert.equal(normalized.sbom.dependencies.length, 3);
assert.equal(normalized.stats.removedDuplicateComponents, 1);
assert.equal(normalized.stats.removedDuplicateDependencies, 1);
assert.deepEqual(
  normalized.sbom.dependencies.find((item) => item.ref === "app@1.0.0").dependsOn,
  ["pkg:npm/debug@3.2.7", "pkg:npm/semver@6.3.1"]
);

const reorderedDependsOn = structuredClone(input);
reorderedDependsOn.dependencies[2].dependsOn = [
  "pkg:npm/semver@6.3.1",
  "pkg:npm/semver@6.3.1"
];
const reorderedResult = normalizeNpmCycloneDx(reorderedDependsOn);
assert.equal(reorderedResult.stats.removedDuplicateDependencies, 1);

const conflictingComponent = structuredClone(input);
conflictingComponent.components[1].licenses = [{ license: { id: "Apache-2.0" } }];
assert.throws(
  () => normalizeNpmCycloneDx(conflictingComponent),
  /コンポーネントの内容が競合/
);

const conflictingDependency = structuredClone(input);
conflictingDependency.dependencies[2].dependsOn = [];
assert.throws(
  () => normalizeNpmCycloneDx(conflictingDependency),
  /依存関係の内容が競合/
);

assert.throws(
  () => normalizeNpmCycloneDx({ ...input, bomFormat: "SPDX" }),
  /CycloneDX形式/
);

console.log("npm生成CycloneDXの重複正規化テストに成功しました。");
