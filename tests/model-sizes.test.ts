import assert from "node:assert/strict";
import test from "node:test";
import { isValidSizeValue, modelSizeTemplate, validSizeOptions } from "../src/lib/model-sizes";

test("known models receive a built-in size template", () => {
  const options = modelSizeTemplate("gpt-image-2");
  assert.equal(options[0].value, "auto");
  assert.ok(options.some((option) => option.value === "2048x1152"));
});

test("APIMart GPT Image 2 uses the documented 15 ratio values", () => {
  const options = modelSizeTemplate("gpt-image-2", "apimart");
  assert.equal(options.length, 16);
  assert.ok(options.some((option) => option.value === "16:9"));
  assert.equal(options.some((option) => option.value === "2048x1152"), false);
});

test("unknown models safely default to automatic sizing", () => {
  assert.deepEqual(modelSizeTemplate("custom-model").map((option) => option.value), ["auto"]);
});

test("custom size values are validated and always retain auto", () => {
  assert.equal(isValidSizeValue("landscape_16_9"), true);
  assert.equal(isValidSizeValue("bad size"), false);
  const options = validSizeOptions([{ key: "wide", label: "宽屏", value: "landscape_16_9", shape: "landscape" }], "custom-model");
  assert.deepEqual(options.map((option) => option.value), ["auto", "landscape_16_9"]);
});
