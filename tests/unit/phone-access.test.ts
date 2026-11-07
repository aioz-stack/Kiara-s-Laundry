import { mkdtempSync, writeFileSync } from "node:fs";
import type { NetworkInterfaceInfo } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PHONE_ACCESS_PORT,
  readPhoneAccess,
  savePhoneAccess,
  shopNetworkAddresses,
} from "../../electron/phone-access";
import { normalizeAddress, PHONE_ACCESS_PORT as PHONE_APP_PORT } from "../../mobile/address.mjs";

function adapter(address: string, internal = false) {
  return { address, family: "IPv4", internal } as NetworkInterfaceInfo;
}

describe("the phone app's server address", () => {
  it("adds http and the Phone access port to a bare address on the shop network", () => {
    expect(normalizeAddress(" 192.168.1.20 ")).toBe("http://192.168.1.20:47800");
    expect(normalizeAddress("10.0.0.5:8080")).toBe("http://10.0.0.5:8080");
    expect(normalizeAddress("172.20.1.9")).toBe("http://172.20.1.9:47800");
  });

  it("uses https for anything on the internet", () => {
    expect(normalizeAddress("kiara.example.com")).toBe("https://kiara.example.com");
    expect(normalizeAddress("https://kiara.example.com/login")).toBe("https://kiara.example.com");
  });

  it("refuses plain http outside the shop network, so passwords stay off the internet", () => {
    expect(normalizeAddress("http://kiara.example.com")).toBeNull();
    expect(normalizeAddress("http://8.8.8.8:47800")).toBeNull();
    expect(normalizeAddress("http://172.32.0.1")).toBeNull();
  });

  it("rejects text that cannot be a server", () => {
    expect(normalizeAddress("")).toBeNull();
    expect(normalizeAddress("not an address")).toBeNull();
    expect(normalizeAddress("file:///data/secret")).toBeNull();
    expect(normalizeAddress("https://user:pass@kiara.example.com")).toBeNull();
  });

  it("matches the desktop app's port", () => {
    expect(PHONE_APP_PORT).toBe(PHONE_ACCESS_PORT);
  });
});

describe("the desktop Phone access setting", () => {
  const folder = mkdtempSync(join(tmpdir(), "kiara-phone-"));

  it("is off until someone turns it on", () => {
    expect(readPhoneAccess(join(folder, "missing.json"))).toBe(false);
  });

  it("stays off when the file is damaged", () => {
    const file = join(folder, "damaged.json");
    writeFileSync(file, "{");
    expect(readPhoneAccess(file)).toBe(false);
  });

  it("remembers the choice", () => {
    const file = join(folder, "saved.json");
    savePhoneAccess(file, true);
    expect(readPhoneAccess(file)).toBe(true);
    savePhoneAccess(file, false);
    expect(readPhoneAccess(file)).toBe(false);
  });
});

describe("the addresses shown for Phone access", () => {
  it("lists only real adapters on a private network", () => {
    expect(
      shopNetworkAddresses({
        "Wi-Fi": [adapter("192.168.254.104")],
        "vEthernet (WSL)": [adapter("172.27.224.1")],
        Ethernet: [adapter("8.8.8.8")],
        lo: [adapter("10.0.0.1", true)],
      }),
    ).toEqual(["192.168.254.104"]);
  });
});
