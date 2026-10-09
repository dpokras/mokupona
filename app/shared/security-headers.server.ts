import { randomBytes } from "node:crypto";

const isProduction = () => process.env.NODE_ENV === "production";

/** Headers every response gets, documents and resource routes alike. */
export function applySecurityHeaders(headers: Headers) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  if (isProduction()) {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
}

export function createNonce() {
  return randomBytes(16).toString("base64");
}

/**
 * Scripts only from this origin or carrying the response's nonce. Vite's dev
 * server injects its own unnonced scripts, so the policy is production-only.
 */
export function contentSecurityPolicy(nonce: string): string | null {
  if (!isProduction()) return null;

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    // inline <style> blocks and style attributes (toasts, the form builder)
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}
