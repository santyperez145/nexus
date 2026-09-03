"use client";

import { useSyncExternalStore } from "react";

export type StoredMsg = { role: "user" | "assistant" | "system"; content: string };

export type ChatSession = {
  id: string;
  title: string;
  model: string;
  messages: StoredMsg[];
  updatedAt: number;
};

const KEY = "nexus_chat_sessions_v1";
const EVENT = "nexus-chat-sessions";
const EMPTY: ChatSession[] = [];

let cachedRaw: string | null = null;
let cached: ChatSession[] = EMPTY;

function parse(raw: string | null): ChatSession[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) ? parsed.slice(0, 24) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function snapshot(): ChatSession[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = localStorage.getItem(KEY);
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  cached = parse(raw);
  return cached;
}

function subscribe(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener("storage", handler);
  window.addEventListener(EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(EVENT, handler);
  };
}

function write(next: ChatSession[]) {
  const raw = JSON.stringify(next.slice(0, 24));
  localStorage.setItem(KEY, raw);
  cachedRaw = raw;
  cached = next.slice(0, 24);
  window.dispatchEvent(new Event(EVENT));
}

export function useChatSessions() {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export function upsertChatSession(entry: Omit<ChatSession, "updatedAt"> & { updatedAt?: number }) {
  const stamped: ChatSession = {
    ...entry,
    updatedAt: entry.updatedAt ?? Date.now(),
    messages: entry.messages.slice(-40),
  };
  const prev = snapshot().filter((s) => s.id !== stamped.id);
  write([stamped, ...prev]);
  return stamped;
}

export function deleteChatSession(id: string) {
  write(snapshot().filter((s) => s.id !== id));
}

export function newSessionId() {
  return `sess_${Math.random().toString(36).slice(2, 10)}`;
}
