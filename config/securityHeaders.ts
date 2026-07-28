export type SecurityHeader = Readonly<{
  key: string;
  value: string;
}>;

export const CONTENT_SECURITY_POLICY = [
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'"
].join("; ");

export const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: CONTENT_SECURITY_POLICY
  },
  {
    key: "X-Frame-Options",
    value: "DENY"
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000"
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none"
  }
] as const satisfies readonly SecurityHeader[];
