import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  anthropicInputToMessages,
  anthropicTools,
  responseFileIds,
  responsesInputToMessages,
} from "../src/lib/gateway/protocol-input";

describe("protocol input translation", () => {
  it("maps Responses instructions, multimodal input and function results", () => {
    const input = [
      {
        role: "user",
        content: [
          { type: "input_text", text: "Describe" },
          { type: "input_image", image_url: "https://example.com/image.png" },
          { type: "input_file", file_id: "file_1" },
        ],
      },
      { type: "function_call_output", call_id: "call_1", output: { ok: true } },
    ];
    const messages = responsesInputToMessages(input, "Be concise");
    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[1]?.role, "user");
    assert.equal(messages[2]?.role, "tool");
    assert.deepEqual(responseFileIds(input), ["file_1"]);
  });

  it("maps Anthropic images, tool use/results and tool schemas", () => {
    const messages = anthropicInputToMessages("Use tools", [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Checking" },
          { type: "tool_use", id: "tool_1", name: "search", input: { q: "Nexus" } },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool_1", content: "done" }],
      },
    ]);
    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[1]?.role, "assistant");
    assert.equal(messages[1]?.tool_calls?.length, 1);
    assert.equal(messages[2]?.role, "tool");
    const tools = anthropicTools([
      { name: "search", description: "Search", input_schema: { type: "object" } },
    ]);
    assert.equal(tools?.[0]?.function.name, "search");
  });
});
