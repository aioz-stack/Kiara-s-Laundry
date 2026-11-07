/**
 * Builds the Windows installer into dist/installer.
 *
 *   npm run desktop:build            Build the installer
 *   npm run desktop:build -- --dir   Build the unpacked app only, which is quicker
 */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

function run(command: string, env: Record<string, string> = {}) {
  execSync(command, { stdio: "inherit", env: { ...process.env, ...env } });
}

const builderArgs = process.argv.slice(2).join(" ");

const removeAll = { recursive: true, force: true, maxRetries: 5, retryDelay: 500 };
rmSync("dist/electron", removeAll);
rmSync("dist/installer", removeAll);
rmSync(".next", removeAll);
run("npx next build", { NEXT_OUTPUT: "standalone" });
// Next copies .env next to the server, and this project's holds real secrets.
rmSync(".next/standalone/.env", { force: true });
run("npx tsc -p electron");
run(`npx electron-builder --win ${builderArgs}`);
