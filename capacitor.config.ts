import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The phone app holds only the pages in mobile/. Orders and accounts stay on the
 * shop's server, which the phone is pointed at on first use.
 */
const config: CapacitorConfig = {
  appId: "com.kiaralaundry.mobile",
  appName: "Kiara Laundry",
  webDir: "mobile",
  server: { errorPath: "error.html" },
};

export default config;
