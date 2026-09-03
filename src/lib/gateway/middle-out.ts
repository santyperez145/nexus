import type { ChatMessage } from "./types";

export function applyMiddleOut(messages: ChatMessage[], maxChars = 120_000): ChatMessage[] {
  const size = JSON.stringify(messages).length;
  if (size <= maxChars) return messages;
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  if (rest.length <= 4) return messages;
  const head = rest.slice(0, 1);
  const tail = rest.slice(-6);
  const marker: ChatMessage = {
    role: "user",
    content: "[nexus middle-out] Se recortó el medio del contexto para entrar en la ventana.",
  };
  return [...system, ...head, marker, ...tail];
}
