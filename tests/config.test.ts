import assert from "node:assert/strict";
import test from "node:test";
import { getPublicConfig, getServerConfig } from "../src/lib/config";

test("deployment protocol defaults to OpenAI and supports APIMart", () => {
  const previous = process.env.IMAGE_API_PROTOCOL;
  try {
    delete process.env.IMAGE_API_PROTOCOL;
    assert.equal(getServerConfig().apiProtocol, "openai");
    process.env.IMAGE_API_PROTOCOL = "apimart";
    assert.equal(getServerConfig().apiProtocol, "apimart");
    assert.equal(getPublicConfig().apiProtocol, "apimart");
  } finally {
    if (previous === undefined) delete process.env.IMAGE_API_PROTOCOL;
    else process.env.IMAGE_API_PROTOCOL = previous;
  }
});
