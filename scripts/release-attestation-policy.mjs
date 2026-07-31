import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEPLOY_WORKFLOW_NAME = "deploy-production.yml";
const RELEASE_SUBJECT = "dist/release-${{ inputs.commit_sha }}.tar.gz";
const SBOM_PATH = "dist/supply-chain/sbom-production.cdx.json";

const extractJob = (workflow, jobName) => {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  if (start < 0) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
};

const extractJobPermissions = (job) => {
  if (!job) return null;
  const lines = job.split("\n");
  const start = lines.findIndex((line) => line === "    permissions:");
  if (start < 0) return null;

  const permissions = new Map();
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^    \S/.test(line)) break;
    const match = line.match(/^      ([A-Za-z0-9-]+):\s*(read|write|none)$/);
    if (match) permissions.set(match[1], match[2]);
  }
  return permissions;
};

const countOccurrences = (text, needle) => text.split(needle).length - 1;

const indexOfStep = (job, stepName) => job?.indexOf(`      - name: ${stepName}`) ?? -1;

const findStepBlock = (job, stepName) => {
  if (!job) return null;
  const lines = job.split("\n");
  const start = lines.findIndex((line) => line === `      - name: ${stepName}`);
  if (start < 0) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("      - name:")) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
};

const hasBroadSubjectPath = (workflow) =>
  workflow
    .split("\n")
    .filter((line) => line.trimStart().startsWith("subject-path:"))
    .some((line) => {
      const value = line.split("subject-path:", 2)[1]?.trim() ?? "";
      return value.includes("*") || value === "dist" || value === "dist/" || value.includes(",");
    });

export const validateReleaseAttestationPolicy = ({ workflow, otherWorkflows = [] }) => {
  const errors = [];
  const build = extractJob(workflow, "build");
  const deploy = extractJob(workflow, "deploy");

  if (!workflow.includes("workflow_dispatch:")) {
    errors.push("本番デプロイWorkflowはworkflow_dispatch専用にしてください。");
  }
  if (!build) errors.push("buildジョブがありません。");
  if (!deploy) errors.push("deployジョブがありません。");

  const permissions = extractJobPermissions(build);
  if (!permissions) {
    errors.push("buildジョブに明示的なpermissionsがありません。");
  } else {
    const required = new Map([
      ["contents", "read"],
      ["id-token", "write"],
      ["attestations", "write"]
    ]);
    for (const [name, value] of required) {
      if (permissions.get(name) !== value) {
        errors.push(`buildジョブの${name}権限は${value}にしてください。`);
      }
    }
    for (const [name, value] of permissions) {
      if (!required.has(name) && value === "write") {
        errors.push(`buildジョブに不要な書き込み権限があります: ${name}`);
      }
    }
  }

  if (deploy?.includes("id-token: write") || deploy?.includes("attestations: write")) {
    errors.push("deployジョブへAttestation用権限を付与しないでください。");
  }
  if (deploy?.includes("actions/attest@")) {
    errors.push("deployジョブでAttestationを生成しないでください。");
  }

  if (countOccurrences(build ?? "", "uses: actions/attest@v4") !== 2) {
    errors.push("buildジョブのactions/attest@v4は2回に固定してください。");
  }
  if (hasBroadSubjectPath(build ?? "")) {
    errors.push("Attestation対象にglob・ディレクトリ・複数パス指定を使用しないでください。");
  }

  const provenance = findStepBlock(build, "リリースアーカイブの生成元証明を作成");
  const sbom = findStepBlock(build, "本番SBOMをリリースアーカイブへ関連付け");

  if (!provenance) {
    errors.push("リリースアーカイブのprovenance生成ステップがありません。");
  } else {
    if (!provenance.includes("uses: actions/attest@v4")) {
      errors.push("provenance生成にactions/attest@v4を使用してください。");
    }
    if (!provenance.includes(`subject-path: ${RELEASE_SUBJECT}`)) {
      errors.push("provenance対象をリリースアーカイブへ固定してください。");
    }
    if (provenance.includes("sbom-path:")) {
      errors.push("provenance生成ステップへsbom-pathを設定しないでください。");
    }
  }

  if (!sbom) {
    errors.push("本番SBOMの関連付けステップがありません。");
  } else {
    if (!sbom.includes("uses: actions/attest@v4")) {
      errors.push("SBOM関連付けにactions/attest@v4を使用してください。");
    }
    if (!sbom.includes(`subject-path: ${RELEASE_SUBJECT}`)) {
      errors.push("SBOM Attestationのsubjectをリリースアーカイブへ固定してください。");
    }
    if (!sbom.includes(`sbom-path: ${SBOM_PATH}`)) {
      errors.push("SBOM Attestationを本番CycloneDX SBOMへ固定してください。");
    }
  }

  const createIndex = indexOfStep(build, "リリース成果物を作成");
  const provenanceIndex = indexOfStep(build, "リリースアーカイブの生成元証明を作成");
  const sbomIndex = indexOfStep(build, "本番SBOMをリリースアーカイブへ関連付け");
  const uploadIndex = indexOfStep(build, "リリース成果物を保存");
  if (
    [createIndex, provenanceIndex, sbomIndex, uploadIndex].some((index) => index < 0) ||
    !(createIndex < provenanceIndex && provenanceIndex < sbomIndex && sbomIndex < uploadIndex)
  ) {
    errors.push("成果物作成→provenance→SBOM関連付け→Artifact保存の順序を維持してください。");
  }

  for (const item of otherWorkflows) {
    if (item.content.includes("actions/attest@")) {
      errors.push(`本番デプロイ以外でAttestationを生成しないでください: ${item.name}`);
    }
    if (item.content.includes("attestations: write")) {
      errors.push(`本番デプロイ以外へattestations: writeを付与しないでください: ${item.name}`);
    }
    if (item.content.includes("id-token: write") && item.name !== DEPLOY_WORKFLOW_NAME) {
      errors.push(`本番デプロイ以外へid-token: writeを付与しないでください: ${item.name}`);
    }
  }

  return errors;
};

const runCli = async () => {
  const workflowPath = resolve(
    process.env.RELEASE_ATTESTATION_WORKFLOW_PATH || ".github/workflows/deploy-production.yml"
  );
  const workflowDirectory = resolve(
    process.env.RELEASE_ATTESTATION_WORKFLOW_DIRECTORY || ".github/workflows"
  );
  const workflow = await readFile(workflowPath, "utf8");
  const otherWorkflows = [];

  for (const name of await readdir(workflowDirectory)) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    if (name === basename(workflowPath)) continue;
    otherWorkflows.push({ name, content: await readFile(join(workflowDirectory, name), "utf8") });
  }

  const errors = validateReleaseAttestationPolicy({ workflow, otherWorkflows });
  if (errors.length > 0) {
    for (const error of errors) console.error(`[ERROR] ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("本番リリースArtifact Attestationポリシーの検証に成功しました。");
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(() => {
    console.error("本番リリースArtifact Attestationポリシーを安全に検証できませんでした。");
    process.exitCode = 1;
  });
}
