import { describe, expect, it } from "vitest";
import {
  appendSessionReferencePrompt,
  formatSessionReferenceClipboard,
  formatSessionReferences,
  normalizeAgentSessionReferences,
  parseSessionReferenceClipboard,
  stripSessionReferenceTokens,
} from "./session-reference.js";

describe("session reference clipboard protocol", () => {
  it("round-trips one reference and cleans multiline metadata", () => {
    const text = formatSessionReferenceClipboard({
      id: "session-1",
      title: "Fix\nlogin error",
      cwd: "D:\\code\\XTLaw\nworkspace",
    });

    expect(text).toBe(
      "[pi-session-reference]\nid: session-1\ntitle: Fix login error\ncwd: D:\\code\\XTLaw workspace\n[/pi-session-reference]",
    );
    expect(parseSessionReferenceClipboard(text)).toEqual([
      { id: "session-1", title: "Fix login error", cwd: "D:\\code\\XTLaw workspace" },
    ]);
  });

  it("parses multiple blocks and optional fields", () => {
    const text = [
      "  [pi-session-reference]",
      "id: one",
      "[/pi-session-reference]",
      "",
      "[pi-session-reference]",
      "id: two",
      "title: Second",
      "[/pi-session-reference]  ",
    ].join("\n");

    expect(parseSessionReferenceClipboard(text)).toEqual([
      { id: "one", title: undefined, cwd: undefined },
      { id: "two", title: "Second", cwd: undefined },
    ]);
  });

  it("returns null for ordinary or malformed text", () => {
    expect(parseSessionReferenceClipboard("hello")).toBeNull();
    expect(
      parseSessionReferenceClipboard("[pi-session-reference]\ntitle: missing id\n[/pi-session-reference]"),
    ).toBeNull();
    expect(
      parseSessionReferenceClipboard(
        "[pi-session-reference]\nid: one\n[/pi-session-reference]\nnot a block",
      ),
    ).toBeNull();
  });
});

describe("formatSessionReferences", () => {
  it("includes only reference identity and display metadata", () => {
    const output = formatSessionReferences([{ id: "session-1", title: "Earlier work" }]);
    expect(output).toContain("id: session-1, title: Earlier work");
    expect(output).not.toContain("transcript");
    expect(output).not.toContain("session content");
  });

  it("normalizes untrusted prompt metadata by identity", () => {
    expect(
      normalizeAgentSessionReferences([
        { id: " one ", title: " First\nwork " },
        { id: "one", title: "ignored" },
        { id: "", title: "invalid" },
        { id: 42 },
        null,
      ]),
    ).toEqual([{ id: "one", title: "First work" }]);
  });

  it("adds references to model context without changing visible text", () => {
    const references = [{ id: "session-1", title: "Earlier work" }];
    expect(appendSessionReferencePrompt("Please compare", references)).toContain(
      "Please compare\n\n[Session references]",
    );
    expect(stripSessionReferenceTokens("before\uE001 after", [{ token: "\uE001" }])).toBe(
      "before after",
    );
  });
});
