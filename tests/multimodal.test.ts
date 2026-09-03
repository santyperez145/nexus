import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { injectImageParts } from "../src/lib/gateway/files";
import { mapChatMessagesForProvider } from "../src/lib/gateway/providers";
import type { ChatMessage } from "../src/lib/gateway/types";

describe("multimodal image_url", () => {
  it("injects image_url parts into the last user message", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "qué hay en la imagen?" },
    ];
    const next = injectImageParts(messages, [
      { url: "data:image/png;base64,aaa", name: "shot.png" },
    ]);
    const user = next[next.length - 1];
    assert.equal(user.role, "user");
    assert.ok(Array.isArray(user.content));
    const parts = user.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    assert.equal(parts[0]?.type, "text");
    assert.equal(parts[0]?.text, "qué hay en la imagen?");
    assert.equal(parts[1]?.type, "image_url");
    assert.equal(parts[1]?.image_url?.url, "data:image/png;base64,aaa");
  });

  it("maps image_url parts to AI SDK image parts", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "describe" },
          { type: "image_url", image_url: { url: "https://example.com/a.png" } },
        ],
      },
    ];
    const mapped = mapChatMessagesForProvider(messages);
    assert.equal(mapped.length, 1);
    const content = mapped[0].content;
    assert.ok(Array.isArray(content));
    const parts = content as Array<{ type: string; text?: string; image?: string }>;
    assert.equal(parts[0]?.type, "text");
    assert.equal(parts[1]?.type, "image");
    assert.equal(parts[1]?.image, "https://example.com/a.png");
  });
});
