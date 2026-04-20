import path from "path";

export const LOCAL_UPLOADS_DIR = path.join(process.cwd(), "local_uploads");

const LOCAL_SCHEME = "local://";

export function isLocalUri(filePath: string): boolean {
  return filePath.startsWith(LOCAL_SCHEME);
}

export function toLocalUri(filename: string): string {
  return `${LOCAL_SCHEME}local_uploads/${filename}`;
}

export function resolveLocalPath(uri: string): string {
  if (!isLocalUri(uri)) throw new Error(`Not a local URI: ${uri}`);
  return path.join(process.cwd(), uri.slice(LOCAL_SCHEME.length));
}
