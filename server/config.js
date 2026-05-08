import path from "node:path";

export const SERVER_PORT = Number(process.env.MEDIAVAULT_SERVER_PORT ?? 8787);
export const MEDIA_DEFAULT_PATH = process.env.MEDIAVAULT_NOTEBOOK_PATH ?? "C:/MediaVault";
export const PENDRIVE_DEFAULT_PATH = process.env.MEDIAVAULT_PENDRIVE_PATH ?? "E:/MediaVault";
export const DB_PATH = path.join(process.cwd(), "server", "data", "mediavault.db");

export function normalizePath(inputPath) {
  if (!inputPath || typeof inputPath !== "string") {
    return "";
  }

  return inputPath.trim().replace(/\\+/g, "/");
}
