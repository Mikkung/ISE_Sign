const fallbackLocalSiteUrl = "http://localhost:3000";

function normalizeSiteUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function getSiteUrl(origin?: string | null) {
  const explicitUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_BASE_URL;

  if (explicitUrl?.trim()) {
    return normalizeSiteUrl(explicitUrl);
  }

  if (origin?.trim()) {
    return normalizeSiteUrl(origin);
  }

  return fallbackLocalSiteUrl;
}

export function safeInternalPath(value: unknown) {
  const path = typeof value === "string" ? value.trim() : "";

  if (!path.startsWith("/") || path.startsWith("//")) {
    return "";
  }

  return path;
}
