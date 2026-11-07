import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";

/** Fixed so that a phone keeps working after the computer restarts. */
export const PHONE_ACCESS_PORT = 47800;

const VIRTUAL_ADAPTER = /vEthernet|WSL|Hyper-V|VMware|VirtualBox|Loopback/i;

function isPrivateIp(address: string) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
}

export function readPhoneAccess(file: string) {
  if (!existsSync(file)) return false;
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { enabled?: unknown }).enabled === true;
  } catch {
    return false;
  }
}

export function savePhoneAccess(file: string, enabled: boolean) {
  writeFileSync(file, JSON.stringify({ enabled }));
}

/** This computer's addresses on the shop network. */
export function shopNetworkAddresses(interfaces = networkInterfaces()) {
  return Object.entries(interfaces).flatMap(([name, addresses]) =>
    VIRTUAL_ADAPTER.test(name)
      ? []
      : (addresses ?? [])
          .filter((item) => item.family === "IPv4" && !item.internal && isPrivateIp(item.address))
          .map((item) => item.address),
  );
}
