import { normalizeAddress } from "./address.mjs";

const { ShopServer } = window.Capacitor.Plugins;
const changing = new URLSearchParams(window.location.search).has("change");
const { address: saved } = await ShopServer.saved();

if (saved && !changing) {
  await ShopServer.connect({ address: saved });
} else {
  const input = document.querySelector("#address");
  const problem = document.querySelector("#problem");
  input.value = saved ?? "";
  document.querySelector("#connect").hidden = false;

  document.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const address = normalizeAddress(input.value);
    problem.hidden = Boolean(address);
    if (address) {
      await ShopServer.connect({ address });
    } else {
      problem.textContent =
        "Check the address. Internet addresses must start with https, and shop computers use numbers like 192.168.1.20.";
    }
  });
}
