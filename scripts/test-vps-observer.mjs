import assert from "node:assert/strict";
import { collectVpsOperations } from "../deploy/sakura-vps/vps-observer.mjs";

const releaseSha = "a".repeat(40);

const commandKey = (file, args) => `${file} ${args.join(" ")}`;

const healthyResponses = new Map([
  [
    commandKey("/usr/bin/systemctl", ["is-active", "nginx"]),
    { ok: true, exitCode: 0, stdout: "active\n", stderr: "" }
  ],
  [
    commandKey("/usr/bin/pm2", ["jlist"]),
    {
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify([{ name: "lol-type-choice", pm2_env: { status: "online" } }]),
      stderr: ""
    }
  ],
  [
    commandKey("/usr/bin/curl", [
      "--fail",
      "--silent",
      "--show-error",
      "--max-time",
      "5",
      "http://127.0.0.1:3000/api/health"
    ]),
    { ok: true, exitCode: 0, stdout: '{"status":"ok"}\n', stderr: "" }
  ],
  [
    commandKey("/usr/bin/df", ["-P", "/var/www/lol-type-choice"]),
    {
      ok: true,
      exitCode: 0,
      stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 100000 42000 58000 42% /\n",
      stderr: ""
    }
  ],
  [
    commandKey("/usr/bin/systemctl", [
      "list-unit-files",
      "--type=timer",
      "--no-legend",
      "--no-pager"
    ]),
    {
      ok: true,
      exitCode: 0,
      stdout: "snap.certbot.renew.timer enabled enabled\napt-daily.timer static -\n",
      stderr: ""
    }
  ],
  [
    commandKey("/usr/bin/systemctl", [
      "show",
      "snap.certbot.renew.timer",
      "--property=ActiveState",
      "--property=UnitFileState",
      "--property=LastTriggerUSec",
      "--property=NextElapseUSecRealtime",
      "--no-pager"
    ]),
    {
      ok: true,
      exitCode: 0,
      stdout:
        "ActiveState=active\nUnitFileState=enabled\nLastTriggerUSec=Wed 2026-07-29 02:00:00 UTC\nNextElapseUSecRealtime=Wed 2026-07-29 14:00:00 UTC\n",
      stderr: ""
    }
  ]
]);

const createDependencies = ({ responseOverrides = new Map(), releaseValue = releaseSha } = {}) => ({
  runCommand: async (file, args) => {
    const key = commandKey(file, args);
    return responseOverrides.get(key) ?? healthyResponses.get(key) ?? {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: "unexpected command"
    };
  },
  readTextFile: async () => releaseValue,
  fileExists: async (path) => {
    if (path === "/usr/bin/pm2") return;
    throw new Error("not found");
  },
  now: new Date("2026-07-29T04:00:00.000Z")
});

const findCheck = (report, id) => report.checks.find((check) => check.id === id);

const healthy = await collectVpsOperations(createDependencies());
assert.equal(healthy.status, "healthy");
assert.equal(healthy.checks.length, 6);
assert.equal(findCheck(healthy, "nginx")?.status, "healthy");
assert.equal(findCheck(healthy, "pm2")?.status, "healthy");
assert.equal(findCheck(healthy, "local_health")?.status, "healthy");
assert.equal(findCheck(healthy, "release")?.details.releaseSha, releaseSha);
assert.equal(findCheck(healthy, "disk")?.details.usedPercent, 42);
assert.equal(findCheck(healthy, "certbot_timer")?.details.activeUnit, "snap.certbot.renew.timer");

const diskKey = commandKey("/usr/bin/df", ["-P", "/var/www/lol-type-choice"]);
const warningDisk = await collectVpsOperations(
  createDependencies({
    responseOverrides: new Map([
      [
        diskKey,
        {
          ok: true,
          exitCode: 0,
          stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 100000 85000 15000 85% /\n",
          stderr: ""
        }
      ]
    ])
  })
);
assert.equal(warningDisk.status, "warning");
assert.equal(findCheck(warningDisk, "disk")?.status, "warning");

const criticalDisk = await collectVpsOperations(
  createDependencies({
    responseOverrides: new Map([
      [
        diskKey,
        {
          ok: true,
          exitCode: 0,
          stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 100000 92000 8000 92% /\n",
          stderr: ""
        }
      ]
    ])
  })
);
assert.equal(criticalDisk.status, "critical");
assert.equal(findCheck(criticalDisk, "disk")?.status, "critical");

const nginxKey = commandKey("/usr/bin/systemctl", ["is-active", "nginx"]);
const nginxDown = await collectVpsOperations(
  createDependencies({
    responseOverrides: new Map([
      [nginxKey, { ok: false, exitCode: 3, stdout: "inactive\n", stderr: "" }]
    ])
  })
);
assert.equal(nginxDown.status, "critical");
assert.equal(findCheck(nginxDown, "nginx")?.status, "critical");

const pm2Key = commandKey("/usr/bin/pm2", ["jlist"]);
const pm2Stopped = await collectVpsOperations(
  createDependencies({
    responseOverrides: new Map([
      [
        pm2Key,
        {
          ok: true,
          exitCode: 0,
          stdout: JSON.stringify([{ name: "lol-type-choice", pm2_env: { status: "stopped" } }]),
          stderr: ""
        }
      ]
    ])
  })
);
assert.equal(findCheck(pm2Stopped, "pm2")?.status, "critical");

const healthKey = commandKey("/usr/bin/curl", [
  "--fail",
  "--silent",
  "--show-error",
  "--max-time",
  "5",
  "http://127.0.0.1:3000/api/health"
]);
const badHealth = await collectVpsOperations(
  createDependencies({
    responseOverrides: new Map([
      [healthKey, { ok: true, exitCode: 0, stdout: '{"status":"degraded"}', stderr: "" }]
    ])
  })
);
assert.equal(findCheck(badHealth, "local_health")?.status, "critical");

const badRelease = await collectVpsOperations(createDependencies({ releaseValue: "not-a-sha" }));
assert.equal(findCheck(badRelease, "release")?.status, "critical");

const listTimersKey = commandKey("/usr/bin/systemctl", [
  "list-unit-files",
  "--type=timer",
  "--no-legend",
  "--no-pager"
]);
const timerMissing = await collectVpsOperations(
  createDependencies({
    responseOverrides: new Map([
      [listTimersKey, { ok: true, exitCode: 0, stdout: "apt-daily.timer static -\n", stderr: "" }]
    ])
  })
);
assert.equal(findCheck(timerMissing, "certbot_timer")?.status, "critical");

const showTimerKey = commandKey("/usr/bin/systemctl", [
  "show",
  "snap.certbot.renew.timer",
  "--property=ActiveState",
  "--property=UnitFileState",
  "--property=LastTriggerUSec",
  "--property=NextElapseUSecRealtime",
  "--no-pager"
]);
const timerInactive = await collectVpsOperations(
  createDependencies({
    responseOverrides: new Map([
      [
        showTimerKey,
        {
          ok: true,
          exitCode: 0,
          stdout: "ActiveState=inactive\nUnitFileState=enabled\nLastTriggerUSec=\nNextElapseUSecRealtime=\n",
          stderr: ""
        }
      ]
    ])
  })
);
assert.equal(findCheck(timerInactive, "certbot_timer")?.status, "critical");

assert.equal(JSON.stringify(healthy).includes("process.env"), false);
assert.equal(JSON.stringify(healthy).includes("SSH_ORIGINAL_COMMAND"), false);

console.log("VPS運用監査の正常・警告・重大系テストに成功しました。");
