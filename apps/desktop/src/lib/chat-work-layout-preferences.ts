import {
  WORK_LAYOUT_CHAT_DEFAULT_WIDTH,
  WORK_LAYOUT_CHAT_MIN_WIDTH,
} from "./work-panel-resize";

export type ChatWorkLayoutMode = "chat" | "work";

export type ChatWorkLayoutPreferences = {
  mode: ChatWorkLayoutMode;
  workLayoutChatWidth: number;
};

const STORAGE_KEY = "pi.desktop.chatWorkLayout";

export const DEFAULT_CHAT_WORK_LAYOUT_PREFERENCES: ChatWorkLayoutPreferences = {
  mode: "chat",
  workLayoutChatWidth: WORK_LAYOUT_CHAT_DEFAULT_WIDTH,
};

function storage(): Storage | null {
  try {
    return typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

export function parseChatWorkLayoutPreferences(
  value: unknown,
): ChatWorkLayoutPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_CHAT_WORK_LAYOUT_PREFERENCES;
  }
  const record = value as Record<string, unknown>;
  const mode = record.mode === "work" ? "work" : "chat";
  const requestedWidth = record.workLayoutChatWidth;
  const workLayoutChatWidth =
    typeof requestedWidth === "number" && Number.isFinite(requestedWidth)
      ? Math.max(WORK_LAYOUT_CHAT_MIN_WIDTH, Math.round(requestedWidth))
      : WORK_LAYOUT_CHAT_DEFAULT_WIDTH;
  return { mode, workLayoutChatWidth };
}

export function loadChatWorkLayoutPreferences(): ChatWorkLayoutPreferences {
  const target = storage();
  if (!target) return DEFAULT_CHAT_WORK_LAYOUT_PREFERENCES;
  try {
    const raw = target.getItem(STORAGE_KEY);
    return raw
      ? parseChatWorkLayoutPreferences(JSON.parse(raw) as unknown)
      : DEFAULT_CHAT_WORK_LAYOUT_PREFERENCES;
  } catch {
    return DEFAULT_CHAT_WORK_LAYOUT_PREFERENCES;
  }
}

export function saveChatWorkLayoutPreferences(
  value: ChatWorkLayoutPreferences,
): void {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(
      STORAGE_KEY,
      JSON.stringify(parseChatWorkLayoutPreferences(value)),
    );
  } catch {
    // Layout preferences are best-effort and must not block the shell.
  }
}
