import { describe, expect, it } from "vitest";
import {
  bindingForCustomModel,
  bindingFromModelInfo,
  bindingSupportsDocuments,
  effectiveContextWindow,
  bindingSupportsImages,
  modelMatchesFilter,
  normalizeApiStyle,
} from "./model-catalog.js";
import type { ModelInfo } from "./types.js";

function visionModel(): ModelInfo {
  return {
    modelId: "vision-model",
    providerId: "provider-1",
    displayName: "Vision Model",
    capabilities: ["text", "vision", "pdf"],
    source: "discovered",
    modalities: { input: ["text", "image", "pdf"], output: ["text"] },
  } as ModelInfo;
}

function textModel(): ModelInfo {
  return {
    modelId: "text-model",
    providerId: "provider-1",
    displayName: "Text Model",
    capabilities: ["text"],
    source: "discovered",
    modalities: { input: ["text"], output: ["text"] },
  } as ModelInfo;
}

describe("effective model context windows", () => {
  it("lets a published long-context window replace the legacy generic seed", () => {
    expect(effectiveContextWindow(1_050_000, 128_000)).toBe(1_050_000);
    expect(effectiveContextWindow(64_000, 128_000)).toBe(64_000);
  });

  it("preserves a non-default per-model override", () => {
    expect(effectiveContextWindow(1_050_000, 256_000)).toBe(256_000);
    expect(effectiveContextWindow(1_050_000, undefined)).toBe(1_050_000);
  });
});

describe("binding context-window provenance", () => {
  it("marks the catalog snapshot a fresh binding is seeded with", () => {
    const binding = bindingFromModelInfo({
      ...textModel(),
      limit: { context: 1_048_576, output: 64_000 },
    });
    expect(binding.contextWindow).toBe(1_048_576);
    expect(binding.contextWindowSource).toBe("catalog");
  });

  it("follows a catalog correction for a catalog-sourced window", () => {
    // The bug this guards: a binding saved before models.dev corrected the
    // model kept the old snapshot forever, so the only fix was deleting and
    // re-adding the model.
    expect(effectiveContextWindow(1_050_000, 1_048_576, "catalog")).toBe(1_050_000);
    expect(effectiveContextWindow(1_050_000, 64_000, "catalog")).toBe(1_050_000);
  });

  it("keeps a hand-edited window even when it equals the generic seed", () => {
    // 128k is a real user answer, not the "inherit the catalog" sentinel, once
    // the binding records where the value came from.
    expect(effectiveContextWindow(1_050_000, 128_000, "user")).toBe(128_000);
    expect(effectiveContextWindow(1_050_000, 256_000, "user")).toBe(256_000);
    // An unpublished model leaves the stored value as the only answer.
    expect(effectiveContextWindow(undefined, 256_000, "user")).toBe(256_000);
    expect(effectiveContextWindow(undefined, 128_000, "catalog")).toBe(128_000);
  });

  it("keeps the historical rule for records written before the marker", () => {
    // Older bindings name no source. The documented fallback is the rule this
    // helper always applied: only the generic 128k seed is inherited.
    expect(effectiveContextWindow(1_050_000, 128_000, undefined)).toBe(1_050_000);
    expect(effectiveContextWindow(1_050_000, 1_048_576, undefined)).toBe(1_048_576);
    expect(effectiveContextWindow(1_050_000, 256_000, null)).toBe(256_000);
    expect(effectiveContextWindow(undefined, 128_000, undefined)).toBe(128_000);
  });

  it("keeps the provenance marker across a JSON round trip", () => {
    const stored = JSON.parse(JSON.stringify(bindingFromModelInfo(textModel())));
    expect(stored.contextWindowSource).toBe("catalog");
    // An edit path stamps the user as the author.
    const edited = { ...stored, contextWindow: 256_000, contextWindowSource: "user" };
    expect(effectiveContextWindow(1_050_000, edited.contextWindow, edited.contextWindowSource)).toBe(
      256_000,
    );
  });
});

describe("provider API style compatibility", () => {
  it("falls back to Chat Completions for missing or unknown persisted styles", () => {
    expect(normalizeApiStyle(undefined)).toBe("chat_completions");
    expect(normalizeApiStyle("auto")).toBe("chat_completions");
    expect(normalizeApiStyle("legacy_style")).toBe("chat_completions");
  });

  it("preserves every current API style", () => {
    expect(normalizeApiStyle("responses")).toBe("responses");
    expect(normalizeApiStyle("anthropic_messages")).toBe("anthropic_messages");
    expect(normalizeApiStyle("opencode_go")).toBe("opencode_go");
  });
});

describe("published attachment capabilities", () => {
  it("reads image and pdf input from the published modalities", () => {
    expect(modelMatchesFilter(visionModel(), "vision")).toBe(true);
    expect(modelMatchesFilter(visionModel(), "pdf")).toBe(true);
    expect(modelMatchesFilter(textModel(), "vision")).toBe(false);
    expect(modelMatchesFilter(textModel(), "pdf")).toBe(false);
  });
});

describe("effective binding attachment capabilities", () => {
  it("follows the published capability while no override is stored", () => {
    const binding = bindingFromModelInfo(visionModel());
    expect(binding.supportsImages).toBeNull();
    expect(bindingSupportsImages(binding, visionModel())).toBe(true);
    expect(bindingSupportsDocuments(binding, visionModel())).toBe(true);
  });

  it("lets an explicit override win in both directions", () => {
    expect(bindingSupportsImages({ supportsImages: false }, visionModel())).toBe(false);
    expect(bindingSupportsImages({ supportsImages: true }, textModel())).toBe(true);
    expect(bindingSupportsDocuments({ supportsDocuments: true }, textModel())).toBe(true);
    expect(bindingSupportsDocuments({ supportsDocuments: false }, visionModel())).toBe(
      false,
    );
  });

  it("treats an unknown model as unsupported unless the user answered", () => {
    // A hand-typed model ID has no published record, so nothing can be inferred.
    const custom = bindingForCustomModel("my-local-model");
    expect(custom.supportsImages).toBeNull();
    expect(bindingSupportsImages(custom, null)).toBe(false);
    expect(bindingSupportsImages({ supportsImages: true }, null)).toBe(true);
  });
});
