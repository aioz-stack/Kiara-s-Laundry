/**
 * The Windows desktop shell. It starts a private PostgreSQL, applies migrations,
 * runs the same Next.js server the web version uses, and shows it in a window.
 */
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, dialog, Menu, session, shell, utilityProcess } from "electron";
import { freePort, startDatabase } from "./database";
import {
  PHONE_ACCESS_PORT,
  readPhoneAccess,
  savePhoneAccess,
  shopNetworkAddresses,
} from "./phone-access";

const APP_ID = "com.kiaralaundry.desktop";
const SERVER_START_TIMEOUT_MS = 60_000;

const LOADING_PAGE = `data:text/html,${encodeURIComponent(`<!doctype html>
<html><head><meta charset="utf-8"><title>Kiara Laundry</title></head>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
font-family:system-ui,sans-serif;color:#334155;background:#f8fafc">
<p>Starting Kiara Laundry. The first start takes a little longer.</p></body></html>`)}`;

function logEvent(message: string) {
  const line = `${new Date().toISOString()} ${message}\n`;
  appendFileSync(join(app.getPath("userData"), "logs", "desktop.log"), line);
}

/** Installed files live under resources. An unpackaged run uses the build output. */
function paths() {
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return app.isPackaged
    ? {
        serverDir: join(root, "server"),
        binDir: join(root, "postgres", "bin"),
        migrationsDir: join(root, "migrations"),
      }
    : {
        serverDir: join(root, ".next", "standalone"),
        binDir: join(root, "node_modules", "@embedded-postgres", "windows-x64", "native", "bin"),
        migrationsDir: join(root, "prisma", "migrations"),
      };
}

type Secrets = { databasePassword: string; authSecret: string };

/** Made once per computer. Nothing secret ships inside the installer. */
function loadSecrets(file: string): Secrets {
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Secrets;
  const secrets = {
    databasePassword: randomBytes(24).toString("hex"),
    authSecret: randomBytes(32).toString("base64"),
  };
  writeFileSync(file, JSON.stringify(secrets));
  return secrets;
}

async function waitForServer(url: string) {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      // A new install redirects to setup, which also means the server is up.
      const response = await fetch(`${url}/login`, {
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status < 500) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The app did not start in time.");
}

async function startServer(
  serverDir: string,
  env: Record<string, string>,
  logPath: string,
  phoneAccess: boolean,
) {
  const port = phoneAccess ? PHONE_ACCESS_PORT : await freePort();
  const url = `http://127.0.0.1:${port}`;
  const server = utilityProcess.fork(join(serverDir, "server.js"), [], {
    cwd: serverDir,
    serviceName: "Kiara Laundry server",
    stdio: "pipe",
    env: {
      ...process.env,
      ...env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      HOSTNAME: phoneAccess ? "0.0.0.0" : "127.0.0.1",
      PORT: String(port),
      NEXTAUTH_URL: url,
      // Whoever opens setup becomes the owner, so it never runs on the network.
      DESKTOP_FIRST_RUN: phoneAccess ? "0" : "1",
    },
  });
  const log = createWriteStream(logPath, { flags: "a" });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  server.on("exit", (code) => logEvent(`server exited with code ${code}`));
  await waitForServer(url);
  logEvent(`server ready at ${url}`);
  return { url, stop: () => server.kill() };
}

function isHttpUrl(value: string) {
  return value.startsWith("https://") || value.startsWith("http://");
}

/** Only the local app runs in the window. Other links open in the normal browser. */
function restrictToApp(window: BrowserWindow, appUrl: string) {
  const isApp = (url: string) => url === appUrl || url.startsWith(`${appUrl}/`);
  const openOutside = (url: string) => {
    if (isHttpUrl(url)) void shell.openExternal(url);
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isApp(url)) return { action: "allow" };
    openOutside(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isApp(url)) return;
    event.preventDefault();
    openOutside(url);
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 480,
    minHeight: 600,
    title: "Kiara Laundry",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.on("closed", () => logEvent("window closed"));
  window.webContents.on("render-process-gone", (_event, details) =>
    logEvent(`page stopped: ${details.reason}`),
  );
  void window.loadURL(LOADING_PAGE);
  return window;
}

/** Changing this restarts the app, because the server chooses its network at start. */
async function showPhoneAccess(window: BrowserWindow, settingsFile: string) {
  const enabled = readPhoneAccess(settingsFile);
  const addresses = shopNetworkAddresses().map((ip) => `${ip}:${PHONE_ACCESS_PORT}`);
  const { response } = await dialog.showMessageBox(
    window,
    enabled
      ? {
          type: "info",
          title: "Phone access",
          message: "Phone access is on",
          detail: addresses.length
            ? `Type this address in the phone app:\n\n${addresses.join("\n")}`
            : "This computer is not on a network right now.",
          buttons: ["Close", "Turn off"],
          cancelId: 0,
          defaultId: 0,
        }
      : {
          type: "warning",
          title: "Phone access",
          message: "Let phones on this network use the app?",
          detail:
            "Anyone on this network can reach the sign-in page, and sign-ins are not encrypted. " +
            "Use this only on the shop's own private Wi-Fi, never one that customers use.\n\n" +
            "If Windows asks, allow access on private networks. The app will restart.",
          buttons: ["Cancel", "Turn on"],
          cancelId: 0,
          defaultId: 0,
        },
  );
  if (response !== 1) return;
  savePhoneAccess(settingsFile, !enabled);
  logEvent(`phone access ${enabled ? "off" : "on"}`);
  app.relaunch();
  app.quit();
}

let shutdown: (() => Promise<unknown>) | null = null;

async function start() {
  const { serverDir, binDir, migrationsDir } = paths();
  const dataRoot = app.getPath("userData");
  const logDir = join(dataRoot, "logs");
  mkdirSync(logDir, { recursive: true });
  logEvent(`starting version ${app.getVersion()}`);
  const secrets = loadSecrets(join(dataRoot, "secrets.json"));

  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, allow) =>
    allow(false),
  );
  const window = createWindow();

  const database = await startDatabase({
    binDir,
    serverDir,
    migrationsDir,
    dataDir: join(dataRoot, "database"),
    logPath: join(logDir, "database.log"),
    password: secrets.databasePassword,
  });
  shutdown = database.stop;

  const phoneAccessFile = join(dataRoot, "phone-access.json");
  const server = await startServer(
    serverDir,
    { DATABASE_URL: database.url, NEXTAUTH_SECRET: secrets.authSecret },
    join(logDir, "server.log"),
    readPhoneAccess(phoneAccessFile),
  );
  shutdown = async () => {
    server.stop();
    await database.stop();
  };

  if (window.isDestroyed()) {
    app.quit();
    return;
  }
  restrictToApp(window, server.url);
  window.setMenu(
    Menu.buildFromTemplate([
      { label: "Phone access", click: () => void showPhoneAccess(window, phoneAccessFile) },
    ]),
  );
  await window.loadURL(server.url);
  logEvent(`showing ${window.webContents.getURL()}`);
}

app.setAppUserModelId(APP_ID);

// Lets a test run use a throwaway folder in place of the shop's real data.
if (process.env.KIARA_DATA_DIR) app.setPath("userData", process.env.KIARA_DATA_DIR);

if (!app.requestSingleInstanceLock()) {
  // A second copy would fight over the database.
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.on("window-all-closed", () => app.quit());

  // Stops the database cleanly before the app exits.
  app.on("before-quit", (event) => {
    logEvent("quitting");
    if (!shutdown) return;
    event.preventDefault();
    const stop = shutdown;
    shutdown = null;
    void stop().finally(() => app.exit(0));
  });

  app
    .whenReady()
    .then(start)
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logEvent(`start failed: ${message}`);
      dialog.showErrorBox(
        "Kiara Laundry could not start",
        `${message}\n\nLogs are in ${join(app.getPath("userData"), "logs")}`,
      );
      await shutdown?.();
      app.exit(1);
    });
}
