import assert from "node:assert/strict";
import test from "node:test";
import { createGameStorage, readSavedInteger } from "../src/storage.js";

test("unavailable storage does not crash startup or lose current-session changes", () => {
  const storage = createGameStorage(() => { throw new Error("SecurityError"); });
  assert.equal(storage.getItem("coins"), null);
  storage.setItem("coins", 120);
  assert.equal(storage.getItem("coins"), "120");
});

test("failed writes never revert to stale persisted values", () => {
  const values = new Map([["coins", "100"]]);
  let full = true;
  const storage = createGameStorage(() => ({
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (full) throw new Error("QuotaExceededError"); values.set(key, value); }
  }));
  assert.equal(storage.getItem("coins"), "100");
  storage.setItem("coins", "50");
  assert.equal(storage.getItem("coins"), "50");
  full = false;
  storage.setItem("coins", "70");
  assert.equal(values.get("coins"), "70");
});

test("corrupt numeric saves cannot create NaN balances or invalid stage numbers", () => {
  const storage = createGameStorage(() => { throw new Error("unavailable"); });
  for (const invalid of ["NaN", "Infinity", "-1", "2.5", "broken", "9007199254740992"]) {
    storage.setItem("value", invalid);
    assert.equal(readSavedInteger(storage, "value"), 0);
  }
  storage.setItem("value", "345");
  assert.equal(readSavedInteger(storage, "value"), 345);
});
