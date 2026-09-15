import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Capacitor 8 emits Windows separators inside Swift path literals during sync.
const packageFile = new URL("../ios/App/CapApp-SPM/Package.swift", import.meta.url);
if (existsSync(packageFile)) {
  const original = readFileSync(packageFile, "utf8");
  const normalized = original.replace(/\bpath: "([^"\r\n]*)"/g,
    (_, path) => `path: "${path.replaceAll("\\", "/")}"`);
  if (normalized !== original) writeFileSync(packageFile, normalized);
}
