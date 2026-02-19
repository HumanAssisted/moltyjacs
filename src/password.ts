import * as fs from "fs";

export const PRIVATE_KEY_PASSWORD_ENV = "JACS_PRIVATE_KEY_PASSWORD";
export const PASSWORD_FILE_ENV = "JACS_PASSWORD_FILE";

export type PasswordSource = "env" | "file";

export interface ResolvePasswordOptions {
  explicitPasswordFile?: string;
  requirePassword?: boolean;
}

export interface ResolvedPassword {
  password: string;
  source: PasswordSource;
  sourceName: string;
}

export function passwordBootstrapHelp(): string {
  return `Password bootstrap options (configure exactly one source):
- ${PRIVATE_KEY_PASSWORD_ENV} (developer default)
- ${PASSWORD_FILE_ENV} (path to a file containing the password)
- --password-file (CLI init convenience; path to a password file)`;
}

function isWhitespaceOnly(value: string): boolean {
  return value.trim().length === 0;
}

function trimTrailingNewlines(value: string): string {
  return value.replace(/[\r\n]+$/g, "");
}

function readPasswordFile(filePath: string, sourceName: string): string {
  const trimmedPath = filePath.trim();
  if (trimmedPath.length === 0) {
    throw new Error(`${sourceName} was provided but empty.\n\n${passwordBootstrapHelp()}`);
  }

  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(trimmedPath);
  } catch (err: any) {
    throw new Error(`Failed to read ${sourceName} at '${trimmedPath}': ${err.message}.\n\n${passwordBootstrapHelp()}`);
  }

  if (stat.isSymbolicLink()) {
    throw new Error(`${sourceName} at '${trimmedPath}' must not be a symlink.\n\n${passwordBootstrapHelp()}`);
  }

  if (!stat.isFile()) {
    throw new Error(`${sourceName} at '${trimmedPath}' must be a regular file.\n\n${passwordBootstrapHelp()}`);
  }

  if (process.platform !== "win32") {
    const mode = stat.mode & 0o777;
    if ((mode & 0o077) !== 0) {
      throw new Error(
        `${sourceName} at '${trimmedPath}' has insecure permissions (${mode.toString(8)}). ` +
        `Restrict to owner-only (for example: chmod 600 '${trimmedPath}').\n\n${passwordBootstrapHelp()}`
      );
    }
  }

  let fileContents: string;
  try {
    fileContents = fs.readFileSync(trimmedPath, "utf-8");
  } catch (err: any) {
    throw new Error(`Failed to read ${sourceName} at '${trimmedPath}': ${err.message}.\n\n${passwordBootstrapHelp()}`);
  }

  const filePassword = trimTrailingNewlines(fileContents);
  if (isWhitespaceOnly(filePassword)) {
    throw new Error(`${sourceName} at '${trimmedPath}' is empty.\n\n${passwordBootstrapHelp()}`);
  }

  return filePassword;
}

export function resolvePrivateKeyPassword(options: ResolvePasswordOptions = {}): ResolvedPassword | null {
  const requirePassword = options.requirePassword !== false;
  const explicitPasswordFileProvided = options.explicitPasswordFile !== undefined;

  const envPassword = process.env[PRIVATE_KEY_PASSWORD_ENV];
  if (envPassword !== undefined && isWhitespaceOnly(envPassword)) {
    throw new Error(`${PRIVATE_KEY_PASSWORD_ENV} is set but empty.\n\n${passwordBootstrapHelp()}`);
  }

  const envPasswordFile = process.env[PASSWORD_FILE_ENV];
  if (envPasswordFile !== undefined && isWhitespaceOnly(envPasswordFile)) {
    throw new Error(`${PASSWORD_FILE_ENV} is set but empty.\n\n${passwordBootstrapHelp()}`);
  }

  const configuredSources = [
    explicitPasswordFileProvided ? "--password-file" : null,
    envPassword !== undefined ? PRIVATE_KEY_PASSWORD_ENV : null,
    envPasswordFile !== undefined ? PASSWORD_FILE_ENV : null,
  ].filter((source): source is string => source !== null);

  if (configuredSources.length > 1) {
    throw new Error(
      `Multiple password sources configured (${configuredSources.join(", ")}). Configure exactly one source.\n\n${passwordBootstrapHelp()}`
    );
  }

  if (envPassword !== undefined) {
    return {
      password: envPassword,
      source: "env",
      sourceName: PRIVATE_KEY_PASSWORD_ENV,
    };
  }

  if (explicitPasswordFileProvided) {
    return {
      password: readPasswordFile(options.explicitPasswordFile || "", "--password-file"),
      source: "file",
      sourceName: "--password-file",
    };
  }

  if (envPasswordFile !== undefined) {
    return {
      password: readPasswordFile(envPasswordFile, PASSWORD_FILE_ENV),
      source: "file",
      sourceName: PASSWORD_FILE_ENV,
    };
  }

  if (!requirePassword) {
    return null;
  }

  throw new Error(`Missing private key password.\n\n${passwordBootstrapHelp()}`);
}
