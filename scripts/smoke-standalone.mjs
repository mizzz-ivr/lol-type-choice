import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const HOSTNAME = "127.0.0.1";
const PORT = process.env.SMOKE_PORT?.trim() || "3100";
const BASE_URL = `http://${HOSTNAME}:${PORT}`;
const STARTUP_TIMEOUT_MS = 30_000;
const SMOKE_SCRIPTS = ["scripts/smoke-test.mjs", "scripts/smoke-type-guides.mjs"];

const server = spawn(process.execPath, [".next/standalone/server.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME,
    PORT,
    NEXT_PUBLIC_SITE_URL: BASE_URL
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverLogs = "";

server.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  serverLogs += text;
  process.stdout.write(text);
});

server.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  serverLogs += text;
  process.stderr.write(text);
});

const waitForServer = async () => {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`standaloneサーバーが起動前に終了しました。\n${serverLogs}`);
    }

    try {
      const response = await fetch(`${BASE_URL}/api/health`, {
        signal: AbortSignal.timeout(2_000)
      });

      if (response.status === 200) {
        return;
      }
    } catch {
      // 起動完了まで再試行する。
    }

    await delay(500);
  }

  throw new Error(`standaloneサーバーが${STARTUP_TIMEOUT_MS / 1000}秒以内に起動しませんでした。\n${serverLogs}`);
};

const stopServer = async () => {
  if (server.exitCode !== null) {
    return;
  }

  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), delay(3_000)]);

  if (server.exitCode === null) {
    server.kill("SIGKILL");
  }
};

const runSmokeScript = async (scriptPath) => {
  const smoke = spawn(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      SMOKE_BASE_URL: BASE_URL
    },
    stdio: "inherit"
  });

  const [exitCode] = await once(smoke, "exit");
  if (exitCode !== 0) {
    throw new Error(`${scriptPath}が終了コード${exitCode}で失敗しました。`);
  }
};

try {
  await waitForServer();

  for (const scriptPath of SMOKE_SCRIPTS) {
    await runSmokeScript(scriptPath);
  }
} finally {
  await stopServer();
}
