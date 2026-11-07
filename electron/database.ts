import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import type * as Pg from "pg";
import { applyMigrations } from "./migrations";

const DB_USER = "kiara";
const DB_NAME = "kiara_laundry";

type DatabaseOptions = {
  binDir: string;
  dataDir: string;
  logPath: string;
  migrationsDir: string;
  /** The folder holding the server's node_modules, where `pg` comes from. */
  serverDir: string;
  password: string;
};

export function freePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not find a free port."));
      });
    });
  });
}

/** Output goes to the log file. A pipe would keep `pg_ctl` waiting on the server it starts. */
function runTool(options: DatabaseOptions, tool: string, args: string[]) {
  const log = openSync(options.logPath, "a");
  return new Promise<number>((resolve, reject) => {
    const child = spawn(join(options.binDir, tool), args, {
      stdio: ["ignore", log, log],
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  }).finally(() => closeSync(log));
}

async function requireTool(options: DatabaseOptions, tool: string, args: string[]) {
  const code = await runTool(options, tool, args);
  if (code !== 0) throw new Error(`${tool} failed. See ${options.logPath}`);
}

/** Builds in a temporary folder, so a run cut short cannot leave half a database. */
async function initialize(options: DatabaseOptions) {
  if (existsSync(join(options.dataDir, "PG_VERSION"))) return;
  const building = `${options.dataDir}.building`;
  const passwordFile = `${options.dataDir}.password`;
  rmSync(building, { recursive: true, force: true });
  writeFileSync(passwordFile, options.password);
  try {
    await requireTool(options, "initdb.exe", [
      "-D",
      building,
      "-U",
      DB_USER,
      `--pwfile=${passwordFile}`,
      "-A",
      "scram-sha-256",
      "-E",
      "UTF8",
      "--locale=C",
      "--locale-provider=builtin",
      "--builtin-locale=C.UTF-8",
    ]);
  } finally {
    rmSync(passwordFile, { force: true });
  }
  renameSync(building, options.dataDir);
}

async function prepareSchema(options: DatabaseOptions, port: number) {
  const { Client } = createRequire(join(options.serverDir, "server.js"))("pg") as typeof Pg;
  const connection = { host: "127.0.0.1", port, user: DB_USER, password: options.password };

  const admin = new Client({ ...connection, database: "postgres" });
  await admin.connect();
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
  if (existing.rowCount === 0) await admin.query(`CREATE DATABASE "${DB_NAME}"`);
  await admin.end();

  const client = new Client({ ...connection, database: DB_NAME });
  await client.connect();
  try {
    await applyMigrations(client, options.migrationsDir);
  } finally {
    await client.end();
  }
}

/** Starts the private database, reachable from this computer only. */
export async function startDatabase(options: DatabaseOptions) {
  await initialize(options);
  const data = ["-D", options.dataDir];
  const stop = () => runTool(options, "pg_ctl.exe", ["stop", ...data, "-m", "fast", "-w"]);

  // A crash can leave the server running from the last session.
  if ((await runTool(options, "pg_ctl.exe", ["status", ...data])) === 0) await stop();

  const port = await freePort();
  await requireTool(options, "pg_ctl.exe", [
    "start",
    ...data,
    "-w",
    "-t",
    "60",
    "-l",
    `${options.logPath}.server`,
    "-o",
    `-p ${port} -c listen_addresses=127.0.0.1`,
  ]);
  try {
    await prepareSchema(options, port);
  } catch (error) {
    await stop();
    throw error;
  }
  return {
    url: `postgresql://${DB_USER}:${options.password}@127.0.0.1:${port}/${DB_NAME}`,
    stop,
  };
}
