import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from "@/config/securityHeaders";

const toHeaderMap = () => new Map(SECURITY_HEADERS.map(({ key, value }) => [key.toLowerCase(), value]));

describe("SECURITY_HEADERS", () => {
  it("ヘッダー名が重複していない", () => {
    const keys = SECURITY_HEADERS.map(({ key }) => key.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("公開前に必要な基本ヘッダーを定義する", () => {
    const headers = toHeaderMap();

    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(headers.get("x-permitted-cross-domain-policies")).toBe("none");
    expect(headers.get("permissions-policy")).toContain("camera=()");
    expect(headers.get("permissions-policy")).toContain("microphone=()");
    expect(headers.get("permissions-policy")).toContain("geolocation=()");
  });

  it("既存のNext.js実行を制限しすぎない最小CSPにする", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("form-action 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("script-src");
    expect(CONTENT_SECURITY_POLICY).not.toContain("style-src");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe-inline");
  });

  it("HSTSで未確認のサブドメインやpreloadを巻き込まない", () => {
    const hsts = toHeaderMap().get("strict-transport-security") ?? "";

    expect(hsts).not.toContain("includeSubDomains");
    expect(hsts).not.toContain("preload");
  });
});
