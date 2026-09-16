import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const code = html.slice(html.indexOf("function openExternal(url){"), html.indexOf('document.getElementById("promo-banner").addEventListener'));
test("opening an external link with noopener does not navigate away from the game", () => {
  const calls = [];
  const location = { href: "capacitor://localhost" };
  const context = vm.createContext({ location, window: { open(...args) { calls.push(args); return null; } } });
  vm.runInContext(code, context);
  context.openExternal("https://example.com/");
  assert.deepEqual(calls, [["https://example.com/", "_blank", "noopener"]]);
  assert.equal(location.href, "capacitor://localhost");
});
