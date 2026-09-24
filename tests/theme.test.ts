import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const component = readFileSync("src/components/image-studio.tsx", "utf8");
const styles = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");

test("offers persistent daylight and night modes", () => {
  assert.match(component, /切换到白昼模式/);
  assert.match(component, /切换到黑夜模式/);
  assert.match(component, /gloopix-lite-theme/);
  assert.match(styles, /\[data-theme="light"\]/);
  assert.match(layout, /prefers-color-scheme: light/);
});
