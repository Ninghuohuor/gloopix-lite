import assert from "node:assert/strict";
import test from "node:test";
import { MAX_BRANDING_ASSET_BYTES, renameBrandingSite, resolveBrandingSettings, validateBrandingAsset } from "../src/lib/local-branding";

test("changing the site name updates the default logo text and browser title", () => {
  const initial = { siteName: "Gloopix Lite", browserTitle: "Gloopix Lite", siteDescription: "", logoText: "Gloopix Lite" };
  assert.deepEqual(renameBrandingSite(initial, "wode"), { ...initial, siteName: "wode", browserTitle: "wode", logoText: "wode" });
  assert.deepEqual(renameBrandingSite({ ...initial, logoText: "我的 Logo", browserTitle: "独立标题" }, "wode"), {
    ...initial, siteName: "wode", logoText: "我的 Logo", browserTitle: "独立标题",
  });
  assert.equal(renameBrandingSite({ ...initial, logoTextCustomized: true }, "wode").logoText, "Gloopix Lite");
});

test("previously saved site names no longer leave the default logo in the header", () => {
  const fallback = { siteName: "Gloopix Lite", browserTitle: "Gloopix Lite", siteDescription: "", logoText: "Gloopix Lite" };
  const migrated = resolveBrandingSettings({ ...fallback, siteName: "wode" }, fallback);
  assert.equal(migrated.siteName, "wode");
  assert.equal(migrated.browserTitle, "wode");
  assert.equal(migrated.logoText, "wode");
  assert.equal(resolveBrandingSettings({ ...fallback, siteName: "wode", logoText: "单独 Logo" }, fallback).logoText, "单独 Logo");
  assert.equal(resolveBrandingSettings({ ...fallback, siteName: "wode", logoTextCustomized: true }, fallback).logoText, "Gloopix Lite");
});

test("accepts browser-local logo and favicon formats", () => {
  assert.equal(validateBrandingAsset({ type: "image/webp", size: 1024 }, "logo"), "");
  assert.equal(validateBrandingAsset({ type: "", size: 1024 }, "favicon", "favicon.ico"), "");
});

test("rejects unsafe or oversized branding images", () => {
  assert.match(validateBrandingAsset({ type: "image/svg+xml", size: 1024 }, "logo"), /仅支持/);
  assert.equal(validateBrandingAsset({ type: "image/png", size: MAX_BRANDING_ASSET_BYTES + 1 }, "favicon"), "图片不能超过 2MB");
});
