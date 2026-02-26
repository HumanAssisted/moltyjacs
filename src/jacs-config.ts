import * as fs from "fs";
import * as path from "path";

export interface JacsConfigFile {
  jacs_agent_public_key_filename?: string;
  jacs_agent_private_key_filename?: string;
  jacs_data_directory?: string;
  jacs_agent_id_and_version?: string;
}

export const DEFAULT_PUBLIC_KEY_FILENAME = "jacs.public.pem";
export const DEFAULT_PRIVATE_KEY_FILENAME = "jacs.private.pem.enc";
export const DEFAULT_DATA_DIRECTORY = "./jacs_data";

export function readJacsConfig(configPath: string): JacsConfigFile | null {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8")) as JacsConfigFile;
  } catch {
    return null;
  }
}

function getFilename(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }
  return path.basename(value);
}

export function getPublicKeyFilename(config: JacsConfigFile | null | undefined): string {
  return getFilename(config?.jacs_agent_public_key_filename, DEFAULT_PUBLIC_KEY_FILENAME);
}

export function getPrivateKeyFilename(config: JacsConfigFile | null | undefined): string {
  return getFilename(config?.jacs_agent_private_key_filename, DEFAULT_PRIVATE_KEY_FILENAME);
}

export function resolvePublicKeyPath(keysDir: string, config: JacsConfigFile | null | undefined): string {
  return path.join(keysDir, getPublicKeyFilename(config));
}

export function resolvePrivateKeyPath(
  keysDir: string,
  config: JacsConfigFile | null | undefined
): string {
  return path.join(keysDir, getPrivateKeyFilename(config));
}

export function resolveConfigRelativePath(configPath: string, configuredPath: unknown): string {
  const safePath =
    typeof configuredPath === "string" && configuredPath.trim() !== ""
      ? configuredPath
      : DEFAULT_DATA_DIRECTORY;
  return path.resolve(path.dirname(path.resolve(configPath)), safePath);
}
