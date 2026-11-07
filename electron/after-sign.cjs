/* eslint-disable @typescript-eslint/no-require-imports -- electron-builder loads this file directly. */
const { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } = require("node:fs");
const { join } = require("node:path");

/** Node's cpSync fails on the junctions Next makes on Windows, so links are followed here. */
function copyReal(source, target) {
  if (!statSync(source).isDirectory()) {
    copyFileSync(source, target);
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(source)) copyReal(join(source, name), join(target, name));
}

/**
 * electron-builder leaves every node_modules folder out of extra resources, but the
 * server needs the ones Next traced.
 */
exports.default = async function afterSign({ appOutDir }) {
  const server = join(appOutDir, "resources", "server");
  for (const folder of ["node_modules", join(".next", "node_modules")]) {
    const source = join(".next", "standalone", folder);
    if (!existsSync(source)) continue;
    rmSync(join(server, folder), { recursive: true, force: true });
    copyReal(source, join(server, folder));
  }
};
