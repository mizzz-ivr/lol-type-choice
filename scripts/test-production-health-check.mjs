import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  formatHealthReportMarkdown,
  runProductionHealthCheck,
  validateProductionSiteUrl
} from "./production-health-check.mjs";

function startTestServer() {
  let mode = "success";

  const server = createServer(async (request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>LoL Playstyle Type Finder β</title>");
      return;
    }

    if (request.url === "/api/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(mode === "invalid-health" ? '{"status":"ng"}' : '{"status":"ok"}');
      return;
    }

    if (request.url === "/robots.txt") {
      if (mode === "robots-500") {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        response.end("internal error: secret-value-must-not-be-reported");
        return;
      }

      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("User-Agent: *\nAllow: /\n");
      return;
    }

    if (request.url === "/sitemap.xml") {
      response.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
      response.end('<?xml version="1.0"?><urlset></urlset>');
      return;
    }

    if (request.url === "/slow") {
      await new Promise((resolve) => setTimeout(resolve, 300));
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("ok");
      return;
    }

    if (request.url === "/redirect") {
      response.writeHead(302, { location: "http://127.0.0.1/private" });
      response.end();
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        setMode(nextMode) {
          mode = nextMode;
        },
        close() {
          return new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          });
        }
      });
    });
  });
}

function testUrlValidation() {
  assert.equal(
    validateProductionSiteUrl("https://example.com").origin,
    "https://example.com"
  );

  assert.throws(
    () => validateProductionSiteUrl("http://example.com"),
    /HTTPS URL/
  );
  assert.throws(
    () => validateProductionSiteUrl("https://localhost"),
    /localhost/
  );
  assert.throws(
    () => validateProductionSiteUrl("https://127.0.0.1"),
    /プライベートまたはループバックIP/
  );
  assert.throws(
    () => validateProductionSiteUrl("https://192.168.1.10"),
    /プライベートまたはループバックIP/
  );
  assert.throws(
    () => validateProductionSiteUrl("https://[::1]"),
    /プライベートまたはループバックIP/
  );
  assert.throws(
    () => validateProductionSiteUrl("https://[::ffff:127.0.0.1]"),
    /プライベートまたはループバックIP/
  );
  assert.throws(
    () => validateProductionSiteUrl("https://user:password@example.com"),
    /認証情報/
  );
  assert.throws(
    () => validateProductionSiteUrl("https://example.com/path"),
    /パス・クエリ・ハッシュ/
  );
}

async function run() {
  testUrlValidation();

  const testServer = await startTestServer();
  const commonOptions = {
    siteUrl: testServer.baseUrl,
    attempts: 1,
    timeoutMs: 1_000,
    retryDelayMs: 0,
    allowHttpForTesting: true,
    allowPrivateForTesting: true
  };

  try {
    const successReport = await runProductionHealthCheck(commonOptions);
    assert.equal(successReport.ok, true);
    assert.equal(successReport.checks.length, 4);
    assert.ok(successReport.checks.every((check) => check.ok));

    testServer.setMode("robots-500");
    const httpFailureReport = await runProductionHealthCheck(commonOptions);
    assert.equal(httpFailureReport.ok, false);
    const robotsCheck = httpFailureReport.checks.find((check) => check.path === "/robots.txt");
    assert.equal(robotsCheck.status, 500);
    assert.match(robotsCheck.error, /HTTP 500/);

    const failureMarkdown = formatHealthReportMarkdown(httpFailureReport, "異常検知");
    assert.match(failureMarkdown, /robots\.txt/);
    assert.doesNotMatch(failureMarkdown, /secret-value-must-not-be-reported/);

    testServer.setMode("invalid-health");
    const invalidContentReport = await runProductionHealthCheck(commonOptions);
    assert.equal(invalidContentReport.ok, false);
    const healthCheck = invalidContentReport.checks.find((check) => check.path === "/api/health");
    assert.match(healthCheck.error, /statusがokではありません/);

    testServer.setMode("success");
    const timeoutReport = await runProductionHealthCheck({
      ...commonOptions,
      timeoutMs: 100,
      targets: [
        {
          name: "タイムアウト確認",
          path: "/slow",
          validate: async () => null
        }
      ]
    });
    assert.equal(timeoutReport.ok, false);
    assert.match(timeoutReport.checks[0].error, /タイムアウト/);

    const redirectReport = await runProductionHealthCheck({
      ...commonOptions,
      targets: [
        {
          name: "リダイレクト確認",
          path: "/redirect",
          validate: async () => null
        }
      ]
    });
    assert.equal(redirectReport.ok, false);
    assert.equal(redirectReport.checks[0].status, 302);
    assert.match(redirectReport.checks[0].error, /HTTP 302/);
  } finally {
    await testServer.close();
  }

  console.log("本番外形監視の正常・異常・タイムアウト・リダイレクトテストに成功しました。");
}

await run();
