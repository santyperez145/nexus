import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { allModels } from "../src/lib/catalog";
import { officialMarkFor } from "../src/lib/catalog/official-marks";

test("every catalog model resolves to a downloaded author identity", () => {
  const missing = [...new Set(allModels().filter((model) => !officialMarkFor(model.author)).map((model) => model.author))];
  assert.deepEqual(missing, []);

  const missingFiles = [
    ...new Set(
      allModels()
        .map((model) => officialMarkFor(model.author)?.src)
        .filter((src): src is string => Boolean(src))
        .filter((src) => !existsSync(path.join(process.cwd(), "public", src.replace(/^\//, "")))),
    ),
  ];
  assert.deepEqual(missingFiles, []);
});

test("author aliases reuse their canonical identity", () => {
  assert.deepEqual(officialMarkFor("~openai"), officialMarkFor("openai"));
  assert.deepEqual(officialMarkFor("~meta-llama"), officialMarkFor("meta-llama"));
});
