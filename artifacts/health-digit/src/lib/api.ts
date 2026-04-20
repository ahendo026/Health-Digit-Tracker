export const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ??
  "http://localhost:8080";

export const apiUrl = (path: string): string => `${API_BASE}${path}`;

const LOCAL_UPLOADS_URI_PREFIX = "local://local_uploads/";

/**
 * Convert a stored filePath into a browser-loadable image URL.
 *
 * In development, uploads use a local:// URI scheme that browsers can't load
 * directly. This maps them to the API's /storage/local_uploads/:filename route.
 * Production GCS paths (/objects/...) use a relative URL so they continue to
 * work regardless of origin.
 */
export function resolveUploadImageUrl(filePath: string): string {
  if (filePath.startsWith(LOCAL_UPLOADS_URI_PREFIX)) {
    const filename = filePath.slice(LOCAL_UPLOADS_URI_PREFIX.length);
    return `${API_BASE}/api/storage/local_uploads/${filename}`;
  }
  return `${API_BASE}/api/storage${filePath}`;
}
