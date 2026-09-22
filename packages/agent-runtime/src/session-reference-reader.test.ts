import { describe, expect, it } from "vitest";
import type { Api, AssistantMessage, Model, Models } from "@earendil-works/pi-ai";
import type { RuntimeProviderConfig } from "./provider-binding.js";
import {
  formatTranscriptLine,
  readReferencedSession,
  splitTranscriptForBudget,
  transcriptLines,
} from "./session-reference-reader.js";
import type { UiMessage } from "@pi-desktop/shared";

function message(
  id: string,
  role: UiMessage["role"],
  content: string,
): UiMessage {
  return {
    id,
    role,
    content,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const provider: RuntimeProviderConfig = {
  id: "test-provider",
  name: "Test provider",
  modelId: "test-model",
  apiKey: "test-key",
  apiStyle: "openai-responses",
  baseUrl: "https://example.invalid",
  supportsReasoning: false,
  supportedThinkingLevels: ["off"],
};

const model = {
  id: provider.modelId,
  name: provider.modelId,
  api: "openai-responses",
  provider: provider.id,
  baseUrl: provider.baseUrl,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 4_096,
  maxTokens: 512,
} as unknown as Model<Api>;

function assistant(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-responses",
    provider: provider.id,
    model: provider.modelId,
    usage: {
      input: 1,
      output: 1,
      totalTokens: 2,
      cacheRead: 0,
      cacheWrite: 0,
    },
    stopReason: "stop",
    timestamp: Date.now(),
  } as AssistantMessage;
}

describe("session-reference-reader", () => {
  it("keeps only visible user and assistant transcript lines", () => {
    const lines = transcriptLines([
      message("u1", "user", "Question"),
      message("tool1", "tool", "secret tool output"),
      message("a1", "assistant", "Answer"),
      message("empty", "assistant", "   "),
    ]);

    expect(lines).toHaveLength(2);
    expect(formatTranscriptLine(lines[0]!)).toContain("Question");
    expect(lines.map((line) => line.text)).not.toContain("secret tool output");
  });

  it("splits by the selected model budget without dropping the tail", () => {
    const lines = [
      { id: "1", role: "user" as const, createdAt: "", text: "A".repeat(300) },
      { id: "2", role: "assistant" as const, createdAt: "", text: "B".repeat(300) },
    ];
    const chunks = splitTranscriptForBudget(lines, 32);
    const combined = chunks.join("");

    expect(chunks.length).toBeGreaterThan(1);
    expect(combined).toContain("A".repeat(300));
    expect(combined).toContain("B".repeat(300));
  });

  it("reads a full host transcript and sends only its extracted answer back", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const host = {
      call: async <T>(method: string, params?: unknown): Promise<T> => {
        calls.push({ method, params });
        return {
          session: {
            id: "past",
            title: "Past session",
            messages: [
              message("u1", "user", "What decision did we make?"),
              message("tool1", "tool", "do not expose this"),
              message("a1", "assistant", "We chose the safer migration."),
            ],
            messageStart: 0,
            hasMoreBefore: false,
          },
        } as T;
      },
    };
    const models = {
      completeSimple: async (_selectedModel: Model<Api>, context: { messages: unknown[] }) => {
        expect(JSON.stringify(context.messages)).toContain("What decision did we make?");
        expect(JSON.stringify(context.messages)).not.toContain("do not expose this");
        return assistant("The decision was the safer migration.");
      },
    } as unknown as Models;

    const result = await readReferencedSession(
      { sessionId: "past", question: "What was decided?" },
      {
        host,
        currentModel: model,
        currentModels: models,
        currentProvider: provider,
        currentSessionId: "current",
      },
    );

    expect(result.text).toBe("The decision was the safer migration.");
    expect(result.details).toMatchObject({
      sessionId: "past",
      messagesRead: 2,
      pagesRead: 1,
      passes: 1,
    });
    expect(calls).toEqual([{ method: "session.get", params: { id: "past" } }]);
  });
});
