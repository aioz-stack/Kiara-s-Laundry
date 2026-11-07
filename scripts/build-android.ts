/**
 * Builds the Android app into dist/android.
 *
 *   npm run android:build            Build the signed app
 *   npm run android:build -- --debug Build a debug app, which allows remote inspection
 */
import { execFileSync, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const debug = process.argv.includes("--debug");
const javaHome = process.env.JAVA_HOME ?? "C:\\Program Files\\Android\\Android Studio\\jbr";
const androidHome =
  process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk");
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome };

/** Every update must carry the same key, so it is made once and then kept. */
function ensureSigningKey() {
  const folder = join("android", "signing");
  const keystore = join(folder, "kiara-laundry.keystore");
  if (existsSync(keystore)) return;
  mkdirSync(folder, { recursive: true });
  const password = randomBytes(24).toString("hex");
  execFileSync(
    join(javaHome, "bin", "keytool"),
    [
      "-genkeypair",
      "-keystore",
      keystore,
      "-alias",
      "kiara-laundry",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "10000",
      "-storepass",
      password,
      "-dname",
      "CN=Kiara Laundry",
    ],
    { stdio: "inherit" },
  );
  writeFileSync(join(folder, "signing.properties"), `password=${password}\n`);
}

if (!debug) ensureSigningKey();
execSync("npx cap sync android", { stdio: "inherit", env });
const task = debug ? "assembleDebug" : "assembleRelease";
execSync(`${process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew"} ${task}`, {
  cwd: "android",
  stdio: "inherit",
  env,
});

const variant = debug ? "debug" : "release";
const output = join("android", "app", "build", "outputs", "apk", variant);
const name = debug ? "app-debug.apk" : "app-release.apk";
mkdirSync(join("dist", "android"), { recursive: true });
copyFileSync(
  join(output, name),
  join("dist", "android", debug ? "Kiara-Laundry-debug.apk" : "Kiara-Laundry.apk"),
);
