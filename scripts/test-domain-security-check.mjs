import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  evaluateCertificate,
  formatDomainSecurityMarkdown,
  isPublicIpAddress,
  runDomainSecurityCheck,
  validateProductionSiteUrl
} from "./domain-security-check.mjs";

const now = new Date("2026-07-29T00:00:00.000Z");
const daysFromNow = (days) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toUTCString();

const publicResolver = async () => [
  { address: "93.184.216.34", family: 4 },
  { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }
];

const createTlsConnector = ({ certificate, error, authorized = true } = {}) => (options) => {
  const socket = new EventEmitter();
  socket.authorized = authorized;
  socket.authorizationError = authorized ? null : "CERT_HAS_EXPIRED";
  socket.getPeerCertificate = () => certificate;
  socket.getProtocol = () => "TLSv1.3";
  socket.getCipher = () => ({ name: "TLS_AES_256_GCM_SHA384" });
  socket.end = () => {};
  socket.destroy = () => {};

  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.minVersion, "TLSv1.2");
  assert.equal(options.servername, "lol.example.com");
  assert.equal(options.host, "93.184.216.34");

  queueMicrotask(() => {
    if (error) {
      socket.emit("error", error);
    } else {
      socket.emit("secureConnect");
    }
  });

  return socket;
};

const healthyCertificate = {
  valid_from: daysFromNow(-10),
  valid_to: daysFromNow(60),
  subject: { CN: "lol.example.com" },
  issuer: { CN: "Test CA" },
  subjectaltname: "DNS:lol.example.com",
  fingerprint256: "AA:BB:CC"
};

assert.equal(isPublicIpAddress("93.184.216.34"), true);
assert.equal(isPublicIpAddress("2606:2800:220:1:248:1893:25c8:1946"), true);
assert.equal(isPublicIpAddress("127.0.0.1"), false);
assert.equal(isPublicIpAddress("10.0.0.1"), false);
assert.equal(isPublicIpAddress("169.254.1.1"), false);
assert.equal(isPublicIpAddress("192.168.1.10"), false);
assert.equal(isPublicIpAddress("203.0.113.10"), false);
assert.equal(isPublicIpAddress("::1"), false);
assert.equal(isPublicIpAddress("fc00::1"), false);
assert.equal(isPublicIpAddress("fe80::1"), false);
assert.equal(isPublicIpAddress("2001:db8::1"), false);
assert.equal(isPublicIpAddress("::ffff:127.0.0.1"), false);

assert.equal(validateProductionSiteUrl("https://lol.example.com"), null);
assert.match(validateProductionSiteUrl(""), /未設定/);
assert.match(validateProductionSiteUrl("http://lol.example.com"), /HTTPS/);
assert.match(validateProductionSiteUrl("https://user:pass@lol.example.com"), /認証情報/);
assert.match(validateProductionSiteUrl("https://lol.example.com/path"), /パス/);
assert.match(validateProductionSiteUrl("https://127.0.0.1"), /非公開IP/);

const healthyEvaluation = evaluateCertificate(
  { validFrom: daysFromNow(-10), validTo: daysFromNow(60) },
  { now, warningDays: 30, criticalDays: 14 }
);
assert.equal(healthyEvaluation.status, "healthy");
assert.equal(healthyEvaluation.daysRemaining, 60);

const warningEvaluation = evaluateCertificate(
  { validFrom: daysFromNow(-10), validTo: daysFromNow(20) },
  { now, warningDays: 30, criticalDays: 14 }
);
assert.equal(warningEvaluation.status, "warning");

const criticalEvaluation = evaluateCertificate(
  { validFrom: daysFromNow(-10), validTo: daysFromNow(7) },
  { now, warningDays: 30, criticalDays: 14 }
);
assert.equal(criticalEvaluation.status, "critical");

const notYetValidEvaluation = evaluateCertificate(
  { validFrom: daysFromNow(1), validTo: daysFromNow(60) },
  { now, warningDays: 30, criticalDays: 14 }
);
assert.equal(notYetValidEvaluation.status, "critical");

const healthyReport = await runDomainSecurityCheck({
  siteUrl: "https://lol.example.com",
  resolveHost: publicResolver,
  connectTls: createTlsConnector({ certificate: healthyCertificate }),
  now,
  warningDays: 30,
  criticalDays: 14
});
assert.equal(healthyReport.status, "healthy");
assert.equal(healthyReport.dns.addresses.length, 2);
assert.equal(healthyReport.dns.selectedAddress, "93.184.216.34");
assert.equal(healthyReport.tls.protocol, "TLSv1.3");
assert.equal(healthyReport.tls.daysRemaining, 60);

const warningReport = await runDomainSecurityCheck({
  siteUrl: "https://lol.example.com",
  resolveHost: publicResolver,
  connectTls: createTlsConnector({
    certificate: { ...healthyCertificate, valid_to: daysFromNow(20) }
  }),
  now,
  warningDays: 30,
  criticalDays: 14
});
assert.equal(warningReport.status, "warning");

const criticalReport = await runDomainSecurityCheck({
  siteUrl: "https://lol.example.com",
  resolveHost: publicResolver,
  connectTls: createTlsConnector({
    certificate: { ...healthyCertificate, valid_to: daysFromNow(7) }
  }),
  now,
  warningDays: 30,
  criticalDays: 14
});
assert.equal(criticalReport.status, "critical");

const missingDnsReport = await runDomainSecurityCheck({
  siteUrl: "https://lol.example.com",
  resolveHost: async () => [],
  connectTls: createTlsConnector({ certificate: healthyCertificate }),
  now
});
assert.equal(missingDnsReport.status, "critical");
assert.match(missingDnsReport.message, /DNS解決結果/);

const privateDnsReport = await runDomainSecurityCheck({
  siteUrl: "https://lol.example.com",
  resolveHost: async () => [{ address: "127.0.0.1", family: 4 }],
  connectTls: createTlsConnector({ certificate: healthyCertificate }),
  now
});
assert.equal(privateDnsReport.status, "critical");
assert.match(privateDnsReport.message, /非公開または予約済みIP/);

const tlsErrorReport = await runDomainSecurityCheck({
  siteUrl: "https://lol.example.com",
  resolveHost: publicResolver,
  connectTls: createTlsConnector({ error: new Error("certificate hostname mismatch") }),
  now
});
assert.equal(tlsErrorReport.status, "critical");
assert.match(tlsErrorReport.message, /証明書検証/);

const invalidThresholdReport = await runDomainSecurityCheck({
  siteUrl: "https://lol.example.com",
  resolveHost: publicResolver,
  connectTls: createTlsConnector({ certificate: healthyCertificate }),
  now,
  warningDays: 10,
  criticalDays: 14
});
assert.equal(invalidThresholdReport.status, "critical");
assert.match(invalidThresholdReport.message, /しきい値/);

const markdown = formatDomainSecurityMarkdown(healthyReport);
assert.match(markdown, /判定: \*\*正常\*\*/);
assert.match(markdown, /TLSv1.3/);
assert.match(markdown, /Test CA/);
assert.equal(markdown.includes("PRIVATE KEY"), false);
assert.equal(JSON.stringify(healthyReport).includes("PRIVATE KEY"), false);

console.log("DNS・TLS監視の正常・警告・異常系テストに成功しました。");
