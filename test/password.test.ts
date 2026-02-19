import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  PASSWORD_FILE_ENV,
  PRIVATE_KEY_PASSWORD_ENV,
  resolvePrivateKeyPassword,
} from "../src/password";

const originalPasswordEnv = process.env[PRIVATE_KEY_PASSWORD_ENV];
const originalPasswordFileEnv = process.env[PASSWORD_FILE_ENV];

function clearPasswordEnv(): void {
  delete process.env[PRIVATE_KEY_PASSWORD_ENV];
  delete process.env[PASSWORD_FILE_ENV];
}

describe("password bootstrap resolver", () => {
  afterEach(() => {
    clearPasswordEnv();
  });

  afterAll(() => {
    if (originalPasswordEnv === undefined) {
      delete process.env[PRIVATE_KEY_PASSWORD_ENV];
    } else {
      process.env[PRIVATE_KEY_PASSWORD_ENV] = originalPasswordEnv;
    }

    if (originalPasswordFileEnv === undefined) {
      delete process.env[PASSWORD_FILE_ENV];
    } else {
      process.env[PASSWORD_FILE_ENV] = originalPasswordFileEnv;
    }
  });

  it("resolves env password when configured", () => {
    process.env[PRIVATE_KEY_PASSWORD_ENV] = "env-secret";
    const resolved = resolvePrivateKeyPassword();
    expect(resolved?.source).toBe("env");
    expect(resolved?.password).toBe("env-secret");
    expect(resolved?.sourceName).toBe(PRIVATE_KEY_PASSWORD_ENV);
  });

  it("resolves explicit --password-file source", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "moltyjacs-password-file-"));
    const passwordPath = path.join(tempDir, "password.txt");
    try {
      fs.writeFileSync(passwordPath, "cli-file-secret\n", { encoding: "utf-8", mode: 0o600 });
      if (process.platform !== "win32") {
        fs.chmodSync(passwordPath, 0o600);
      }

      const resolved = resolvePrivateKeyPassword({ explicitPasswordFile: passwordPath });
      expect(resolved?.source).toBe("file");
      expect(resolved?.sourceName).toBe("--password-file");
      expect(resolved?.password).toBe("cli-file-secret");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves file password and trims trailing newline", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "moltyjacs-password-"));
    const passwordPath = path.join(tempDir, "password.txt");
    try {
      fs.writeFileSync(passwordPath, "file-secret\n", { encoding: "utf-8", mode: 0o600 });
      if (process.platform !== "win32") {
        fs.chmodSync(passwordPath, 0o600);
      }
      process.env[PASSWORD_FILE_ENV] = passwordPath;

      const resolved = resolvePrivateKeyPassword();
      expect(resolved?.source).toBe("file");
      expect(resolved?.password).toBe("file-secret");
      expect(resolved?.sourceName).toBe(PASSWORD_FILE_ENV);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails on insecure password file permissions on unix", () => {
    if (process.platform === "win32") {
      return;
    }
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "moltyjacs-password-perm-"));
    const passwordPath = path.join(tempDir, "password.txt");
    try {
      fs.writeFileSync(passwordPath, "perm-secret\n", { encoding: "utf-8", mode: 0o644 });
      fs.chmodSync(passwordPath, 0o644);
      process.env[PASSWORD_FILE_ENV] = passwordPath;
      expect(() => resolvePrivateKeyPassword()).toThrow(/insecure permissions/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when multiple sources are configured", () => {
    process.env[PRIVATE_KEY_PASSWORD_ENV] = "env-secret";
    process.env[PASSWORD_FILE_ENV] = "/tmp/unused";
    expect(() => resolvePrivateKeyPassword()).toThrow(/Multiple password sources configured/);
  });

  it("fails when no source is configured", () => {
    expect(() => resolvePrivateKeyPassword()).toThrow(/Missing private key password/);
  });
});
