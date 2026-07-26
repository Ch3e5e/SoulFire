import type { Interceptor } from "@connectrpc/connect";

export interface SoulFireInstallOptions {
  /**
   * Directory used for the managed JVM, SoulFire JAR, and server data.
   * Defaults to `.soulfire` below the current working directory.
   */
  directory?: string;
  /**
   * SoulFire release tag. Omit this value to install the latest release.
   */
  version?: string;
  /**
   * Java arguments added before the SoulFire JAR.
   */
  javaArgs?: string[];
  /**
   * Local gRPC-Web port. Omit this value to select an available port.
   */
  port?: number;
  /**
   * Maximum time to wait for SoulFire to finish loading.
   */
  startupTimeoutMs?: number;
  /**
   * Receives lines written by the dedicated server.
   */
  onLog?: (line: string) => void;
  /**
   * Custom fetch implementation, primarily for runtimes that do not expose
   * fetch globally.
   */
  fetch?: typeof globalThis.fetch;
  /**
   * Default timeout for unary SDK calls after the server starts.
   */
  defaultTimeoutMs?: number;
  /**
   * Additional interceptors applied to the installed server connection.
   */
  interceptors?: Interceptor[];
}

export interface LocalSoulFireServer {
  readonly baseUrl: string;
  readonly directory: string;
  readonly jarPath: string;
  readonly javaPath: string;
  readonly pid: number;
  readonly runDirectory: string;
  readonly version: string;
}
