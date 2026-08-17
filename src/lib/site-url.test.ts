import { describe, expect, it, vi } from "vitest";
import { getSiteUrl, safeInternalPath } from "./site-url";

describe("site URL helpers", () => {
  it("prefers NEXT_PUBLIC_SITE_URL and removes trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ise-sign.vercel.app/");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");

    expect(getSiteUrl("http://localhost:3001")).toBe("https://ise-sign.vercel.app");

    vi.unstubAllEnvs();
  });

  it("falls back to local origin when no explicit site URL is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("APP_BASE_URL", "");

    expect(getSiteUrl("http://localhost:3001/")).toBe("http://localhost:3001");

    vi.unstubAllEnvs();
  });

  it("allows only internal next paths", () => {
    expect(safeInternalPath("/update-password")).toBe("/update-password");
    expect(safeInternalPath("https://evil.example")).toBe("");
    expect(safeInternalPath("//evil.example")).toBe("");
  });
});
