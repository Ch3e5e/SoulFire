import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import net from "node:net";

import AdmZip from "adm-zip";
import * as tar from "tar";

import type {
  LocalSoulFireServer,
  SoulFireInstallOptions,
} from "./install-types.js";

const ROOT_USER_UUID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_STARTUP_TIMEOUT_MS = 120_000;
const RELEASES_API =
  "https://api.github.com/repos/soulfiremc-com/SoulFire/releases";

interface GitHubAsset {
  browser_download_url?: string;
  digest?: string;
  name?: string;
}

interface GitHubRelease {
  assets?: GitHubAsset[];
  tag_name?: string;
}

interface AdoptiumRelease {
  binary?: {
    package?: {
      checksum?: string;
      link?: string;
    };
  };
  release_name?: string;
}

export interface LocalServerHandle {
  readonly info: LocalSoulFireServer;
  readonly token: string;
  close(): Promise<void>;
}

export async function installLocalServer(
  options: SoulFireInstallOptions = {},
): Promise<LocalServerHandle> {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (fetchImplementation === undefined) {
    throw new Error("SoulFire.install() requires a fetch implementation");
  }

  const directory = path.resolve(options.directory ?? ".soulfire");
  await mkdir(directory, { recursive: true });

  const javaPath = await ensureJvm(
    path.join(directory, "jvm-25"),
    fetchImplementation,
  );
  const release = await resolveRelease(options.version, fetchImplementation);
  const jar = resolveDedicatedAsset(release, options.version);
  const jarPath = path.join(directory, "jars", jar.name);
  await ensureDownload(
    jar.browser_download_url,
    jarPath,
    requireSha256Digest(jar.digest, "SoulFire release"),
    fetchImplementation,
  );

  const runDirectory = path.join(directory, "server");
  await mkdir(runDirectory, { recursive: true });
  const port = options.port ?? (await findAvailablePort());
  validatePort(port);

  const child = spawn(
    javaPath,
    [
      ...(options.javaArgs ?? []),
      `-Dsf.grpc.port=${port}`,
      "-jar",
      jarPath,
    ],
    {
      cwd: runDirectory,
      env: {
        ...process.env,
        JAVA_HOME: getJavaHome(path.join(directory, "jvm-25")),
      },
      stdio: "pipe",
      windowsHide: true,
    },
  );

  try {
    await waitForServerReady(
      child,
      options.onLog,
      options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
    );
    const secretKey = await readFile(path.join(runDirectory, "secret-key.bin"));
    const baseUrl = `http://127.0.0.1:${port}`;

    return {
      info: {
        baseUrl,
        directory,
        jarPath,
        javaPath,
        pid: requirePid(child.pid),
        runDirectory,
        version: release.tag_name,
      },
      token: createRootApiToken(secretKey),
      close: () => stopChild(child),
    };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

export async function resolveRelease(
  version: string | undefined,
  fetchImplementation: typeof globalThis.fetch,
): Promise<Required<Pick<GitHubRelease, "assets" | "tag_name">>> {
  const requestedVersion = version?.trim();
  if (version !== undefined && !requestedVersion) {
    throw new TypeError("SoulFire version must not be empty");
  }

  const endpoint =
    requestedVersion === undefined
      ? `${RELEASES_API}/latest`
      : `${RELEASES_API}/tags/${encodeURIComponent(requestedVersion)}`;
  const response = await fetchImplementation(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "@soulfiremc/sdk",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch SoulFire release metadata (${response.status})`,
    );
  }

  const release = (await response.json()) as GitHubRelease;
  if (!release.tag_name || !Array.isArray(release.assets)) {
    throw new Error("SoulFire release metadata was incomplete");
  }
  return {
    assets: release.assets,
    tag_name: release.tag_name,
  };
}

function resolveDedicatedAsset(
  release: Required<Pick<GitHubRelease, "assets" | "tag_name">>,
  requestedVersion: string | undefined,
): Required<
  Pick<GitHubAsset, "browser_download_url" | "digest" | "name">
> {
  const expectedName = `SoulFireDedicated-${
    requestedVersion?.trim() ?? release.tag_name
  }.jar`;
  const asset =
    release.assets.find((candidate) => candidate.name === expectedName) ??
    release.assets.find((candidate) =>
      /^SoulFireDedicated-.+\.jar$/.test(candidate.name ?? ""),
    );
  if (!asset?.name || !asset.browser_download_url || !asset.digest) {
    throw new Error(
      `SoulFire release ${release.tag_name} has no verified dedicated server JAR`,
    );
  }
  return {
    browser_download_url: asset.browser_download_url,
    digest: asset.digest,
    name: asset.name,
  };
}

async function ensureJvm(
  jvmDirectory: string,
  fetchImplementation: typeof globalThis.fetch,
): Promise<string> {
  const javaPath = path.join(
    getJavaHome(jvmDirectory),
    "bin",
    process.platform === "win32" ? "java.exe" : "java",
  );
  if (await exists(javaPath)) {
    return javaPath;
  }

  const os = detectOs();
  const architecture = detectArchitecture();
  const metadataUrl =
    "https://api.adoptium.net/v3/assets/latest/25/hotspot" +
    `?architecture=${architecture}&image_type=jre&os=${os}&vendor=eclipse`;
  const response = await fetchImplementation(metadataUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch JVM metadata (${response.status})`);
  }

  const releases = (await response.json()) as AdoptiumRelease[];
  const packageMetadata = releases[0]?.binary?.package;
  const checksum = packageMetadata?.checksum;
  const downloadUrl = packageMetadata?.link;
  const releaseName = releases[0]?.release_name;
  if (!checksum || !downloadUrl || !releaseName) {
    throw new Error("JVM metadata was incomplete");
  }

  const temporaryRoot = path.join(
    path.dirname(jvmDirectory),
    `.jvm-25-${randomUUID()}`,
  );
  const archivePath = `${temporaryRoot}.download`;
  await mkdir(temporaryRoot, { recursive: true });

  try {
    await downloadFile(
      downloadUrl,
      archivePath,
      checksum,
      fetchImplementation,
    );
    if (downloadUrl.endsWith(".zip")) {
      new AdmZip(archivePath).extractAllTo(temporaryRoot, true);
    } else if (downloadUrl.endsWith(".tar.gz")) {
      await tar.x({ cwd: temporaryRoot, file: archivePath });
    } else {
      throw new Error("Unsupported JVM archive type");
    }

    const extractedJvm = path.join(temporaryRoot, `${releaseName}-jre`);
    const extractedJava = path.join(
      getJavaHome(extractedJvm),
      "bin",
      process.platform === "win32" ? "java.exe" : "java",
    );
    if (!(await exists(extractedJava))) {
      throw new Error("Extracted JVM is missing the Java executable");
    }

    await rm(jvmDirectory, { force: true, recursive: true });
    await rename(extractedJvm, jvmDirectory);
  } finally {
    await rm(archivePath, { force: true });
    await rm(temporaryRoot, { force: true, recursive: true });
  }

  return javaPath;
}

async function ensureDownload(
  url: string,
  destination: string,
  checksum: string,
  fetchImplementation: typeof globalThis.fetch,
): Promise<void> {
  if (
    (await exists(destination)) &&
    (await sha256File(destination)) === checksum
  ) {
    return;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.${randomUUID()}.download`;
  try {
    await downloadFile(url, temporaryPath, checksum, fetchImplementation);
    await rm(destination, { force: true });
    await rename(temporaryPath, destination);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function downloadFile(
  url: string,
  destination: string,
  checksum: string,
  fetchImplementation: typeof globalThis.fetch,
): Promise<void> {
  const response = await fetchImplementation(url);
  if (!response.ok || response.body === null) {
    throw new Error(`Download failed for ${url} (${response.status})`);
  }

  const file = await import("node:fs/promises").then(({ open }) =>
    open(destination, "wx"),
  );
  const hash = createHash("sha256");
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      await file.write(value);
      hash.update(value);
    }
    await file.sync();
  } finally {
    await file.close();
  }

  const actualChecksum = hash.digest("hex");
  if (actualChecksum !== checksum.toLowerCase()) {
    throw new Error("Downloaded file checksum verification failed");
  }
}

function requireSha256Digest(digest: string, label: string): string {
  const match = /^sha256:([a-fA-F0-9]{64})$/.exec(digest);
  if (!match?.[1]) {
    throw new Error(`${label} did not include a SHA-256 digest`);
  }
  return match[1].toLowerCase();
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function waitForServerReady(
  child: ChildProcessWithoutNullStreams,
  onLog: ((line: string) => void) | undefined,
  timeoutMs: number,
): Promise<void> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("startupTimeoutMs must be a positive integer");
  }

  const output = readline.createInterface({
    input: child.stdout,
  });
  const errors = readline.createInterface({
    input: child.stderr,
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `SoulFire did not finish loading within ${timeoutMs} milliseconds`,
          ),
        ),
      );
    }, timeoutMs);

    const handleLine = (rawLine: string) => {
      const line = stripAnsi(rawLine).trim();
      if (!line) {
        return;
      }
      try {
        onLog?.(line);
      } catch {
        // Log consumers must not interrupt process output handling.
      }
      if (line.includes("Finished loading!")) {
        finish(resolve);
      }
    };
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      child.off("error", handleError);
      child.off("exit", handleExit);
      callback();
    };
    const handleError = (error: Error) => finish(() => reject(error));
    const handleExit = (code: number | null) =>
      finish(() =>
        reject(
          new Error(
            `SoulFire exited before finishing loading (exit code ${code ?? "unknown"})`,
          ),
        ),
      );

    output.on("line", handleLine);
    errors.on("line", handleLine);
    child.once("error", handleError);
    child.once("exit", handleExit);
  });
}

async function stopChild(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function createRootApiToken(secretKey: Buffer): string {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      aud: ["api"],
      iat: issuedAt,
      sub: ROOT_USER_UUID,
    }),
  ).toString("base64url");
  const unsignedToken = `${header}.${claims}`;
  const signature = createHmac("sha256", secretKey)
    .update(unsignedToken)
    .digest("base64url");
  return `${unsignedToken}.${signature}`;
}

function detectArchitecture(): string {
  switch (process.arch) {
    case "arm":
      return "arm";
    case "arm64":
      return "aarch64";
    case "ia32":
      return "x32";
    case "ppc64":
      return "ppc64";
    case "riscv64":
      return "riscv64";
    case "s390x":
      return "s390x";
    case "x64":
      return "x64";
    default:
      throw new Error(`Unsupported architecture: ${process.arch}`);
  }
}

function detectOs(): string {
  switch (process.platform) {
    case "darwin":
      return "mac";
    case "linux":
      return "linux";
    case "win32":
      return "windows";
    default:
      throw new Error(`Unsupported operating system: ${process.platform}`);
  }
}

function getJavaHome(jvmDirectory: string): string {
  return process.platform === "darwin"
    ? path.join(jvmDirectory, "Contents", "Home")
    : jvmDirectory;
}

async function findAvailablePort(): Promise<number> {
  const server = net.createServer();
  return await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to select an available port"));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });
}

function validatePort(port: number): void {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError("port must be an integer between 1 and 65535");
  }
}

function requirePid(pid: number | undefined): number {
  if (pid === undefined) {
    throw new Error("SoulFire process did not provide a process ID");
  }
  return pid;
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*[A-Za-z]/g, "");
}
