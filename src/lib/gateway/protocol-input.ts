import type { ChatMessage } from "./types";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function stringify(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

function textFromBlocks(value: unknown) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return stringify(value);
  return value
    .map((entry) => {
      const block = record(entry);
      return typeof block?.text === "string" ? block.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function responseContent(value: unknown): ChatMessage["content"] {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return stringify(value);
  return value
    .map((entry) => {
      const block = record(entry);
      if (!block) return null;
      const type = String(block.type ?? "input_text");
      if (type === "input_image" && typeof block.image_url === "string") {
        return { type: "image_url", image_url: { url: block.image_url } };
      }
      if (type === "input_file") {
        const label = block.filename ?? block.file_id ?? "attached file";
        return { type: "text", text: `[${String(label)}]` };
      }
      return { type: "text", text: stringify(block.text ?? block.content ?? "") };
    })
    .filter((part): part is NonNullable<typeof part> => Boolean(part));
}

export function responseFileIds(input: unknown) {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = record(value);
    if (!item) return;
    if (item.type === "input_file" && typeof item.file_id === "string") ids.add(item.file_id);
    Object.values(item).forEach(visit);
  };
  visit(input);
  return [...ids];
}

/** Convert OpenAI Responses input items into the gateway's canonical chat transcript. */
export function responsesInputToMessages(input: unknown, instructions?: unknown): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const system = textFromBlocks(instructions).trim();
  if (system) messages.push({ role: "system", content: system });

  const items = Array.isArray(input) ? input : [input];
  for (const raw of items) {
    if (typeof raw === "string") {
      if (raw) messages.push({ role: "user", content: raw });
      continue;
    }
    const item = record(raw);
    if (!item) continue;
    if (item.type === "function_call_output") {
      messages.push({
        role: "tool",
        tool_call_id: String(item.call_id ?? item.id ?? "tool"),
        content: stringify(item.output),
      });
      continue;
    }
    if (item.type === "function_call") {
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: String(item.call_id ?? item.id ?? "tool"),
            type: "function",
            function: {
              name: String(item.name ?? "tool"),
              arguments: stringify(item.arguments ?? "{}"),
            },
          },
        ],
      });
      continue;
    }
    const candidateRole = String(item.role ?? "user");
    const role: ChatMessage["role"] =
      candidateRole === "assistant" || candidateRole === "system" || candidateRole === "tool"
        ? candidateRole
        : "user";
    messages.push({ role, content: responseContent(item.content ?? item.text ?? "") });
  }
  return messages;
}

function anthropicImage(block: UnknownRecord) {
  const source = record(block.source);
  if (!source) return null;
  if (source.type === "base64" && typeof source.data === "string") {
    return {
      type: "image_url",
      image_url: {
        url: `data:${String(source.media_type ?? "image/png")};base64,${source.data}`,
      },
    };
  }
  if (source.type === "url" && typeof source.url === "string") {
    return { type: "image_url", image_url: { url: source.url } };
  }
  return null;
}

/** Convert Anthropic Messages blocks, including tool use/results, into canonical chat messages. */
export function anthropicInputToMessages(system: unknown, input: unknown): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const systemText = textFromBlocks(system).trim();
  if (systemText) messages.push({ role: "system", content: systemText });

  for (const raw of Array.isArray(input) ? input : []) {
    const item = record(raw);
    if (!item) continue;
    const role = item.role === "assistant" ? "assistant" : "user";
    if (typeof item.content === "string") {
      messages.push({ role, content: item.content });
      continue;
    }
    const content: Exclude<ChatMessage["content"], string> = [];
    const toolCalls: unknown[] = [];
    const toolResults: ChatMessage[] = [];
    for (const rawBlock of Array.isArray(item.content) ? item.content : []) {
      const block = record(rawBlock);
      if (!block) continue;
      if (block.type === "text") {
        content.push({ type: "text", text: stringify(block.text) });
      } else if (block.type === "image") {
        const image = anthropicImage(block);
        if (image) content.push(image);
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: String(block.id ?? "tool"),
          type: "function",
          function: { name: String(block.name ?? "tool"), arguments: stringify(block.input ?? {}) },
        });
      } else if (block.type === "tool_result") {
        toolResults.push({
          role: "tool",
          tool_call_id: String(block.tool_use_id ?? "tool"),
          content: textFromBlocks(block.content),
        });
      }
    }
    if (content.length || toolCalls.length) {
      messages.push({ role, content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    }
    messages.push(...toolResults);
  }
  return messages;
}

export function anthropicTools(tools: unknown) {
  if (!Array.isArray(tools)) return undefined;
  return tools.map((raw) => {
    const item = record(raw) ?? {};
    return {
      type: "function",
      function: {
        name: String(item.name ?? "tool"),
        description: typeof item.description === "string" ? item.description : undefined,
        parameters: record(item.input_schema) ?? { type: "object", properties: {} },
      },
    };
  });
}
