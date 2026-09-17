import type { BrowserState } from "@pi-desktop/shared";
import type { BrowserPane } from "./browser-view";
import { BrowserCdp } from "./browser-cdp";
import {
  isBrowserTextSelection,
  parseBrowserSelection,
  parseBrowserSelectionComment,
  type BrowserElementSelection,
  type BrowserTextSelection,
} from "./browser-element-selection";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const BROWSER_PLUGIN_ID = "pi.browser";
export const BROWSER_VIEW_ID = "browser";

export type BrowserRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserNavigateInput = {
  url?: string;
  path?: string;
};

/**
 * Translate a plugin-page hole into window coordinates and clamp it so the
 * guest cannot cover chat/composer outside the calling plugin view.
 */
export function clampGuestBounds(
  view: BrowserRect,
  hole: BrowserRect,
): BrowserRect | null {
  const x = Math.max(view.x, view.x + hole.x);
  const y = Math.max(view.y, view.y + hole.y);
  const right = Math.min(view.x + view.width, view.x + hole.x + hole.width);
  const bottom = Math.min(view.y + view.height, view.y + hole.y + hole.height);
  const width = Math.floor(right - x);
  const height = Math.floor(bottom - y);
  if (width < 1 || height < 1) return null;
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width,
    height,
  };
}

function asRect(value: unknown): BrowserRect | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  return { x, y, width, height };
}

export type BrowserHostDeps = {
  pane: BrowserPane;
  isPluginLoaded: (pluginId: string) => boolean;
  getFileRoot: (sessionId?: string) => Promise<string | null>;
  getScratchDir?: (sessionId?: string) => string | null;
  onState: (state: BrowserState) => void;
  /**
   * Selections carry the comment written in the picker's own card. It is
   * undefined for a card that was never used, and an empty string for one
   * saved without text — downstream the two are not the same thing.
   */
  onElementSelection?: (selection: BrowserElementSelection, comment?: string) => void;
  onElementCopy?: (selection: BrowserElementSelection) => void;
  onTextSelection?: (selection: BrowserTextSelection, comment?: string) => void;
  onTextCopy?: (selection: BrowserTextSelection) => void;
  onPickerState?: (enabled: boolean) => void;
};

type ChromeSurface = {
  pluginId: string;
  viewId: string;
  visible: boolean;
  bounds: BrowserRect;
};

/**
 * Public `pi.browser.*` implementation: one host-owned guest WebContentsView,
 * driven by plugin chrome through a clamped hole, plus CDP for the agent.
 */
export class BrowserHost {
  private readonly pane: BrowserPane;
  private readonly cdp = new BrowserCdp();
  private readonly deps: BrowserHostDeps;
  private chrome: ChromeSurface | null = null;
  private hole: BrowserRect | null = null;
  private holePluginId: string | null = null;
  private readonly locations = new Map<string, string>();
  private chromeSessionId: string | null = null;
  private started = false;
  private elementPickerEnabled = false;

  constructor(deps: BrowserHostDeps) {
    this.deps = deps;
    this.pane = deps.pane;
  }

  setChromeSurface(surface: ChromeSurface | null): void {
    this.chrome = surface;
    this.applyGuest();
  }

  setChromeSession(sessionId: string | undefined): void {
    const next = sessionId?.trim() || null;
    if (this.chromeSessionId === next) return;
    this.chromeSessionId = next;
    if (next) void this.rebindSession(next);
  }

  /**
   * Content-relative hole inside the calling plugin view. Last writer wins
   * (v1 is a singleton guest).
   */
  setGuestHole(pluginId: string, hole: unknown): BrowserRect | null {
    const rect = asRect(hole);
    if (!rect) {
      this.hole = null;
      this.holePluginId = pluginId;
      this.applyGuest();
      return null;
    }
    this.hole = rect;
    this.holePluginId = pluginId;
    this.applyGuest();
    return this.guestBounds();
  }

  setGuestVisible(pluginId: string, visible: boolean): void {
    if (!visible && this.holePluginId === pluginId) {
      this.pane.setVisible(false);
      return;
    }
    if (visible) this.applyGuest();
  }

  rememberLocation(sessionId: string | undefined, location: string): void {
    const id = sessionId?.trim();
    const value = location.trim();
    if (!id || !value) return;
    this.locations.set(id, value);
  }

  async navigate(
    input: BrowserNavigateInput,
    sessionId?: string,
  ): Promise<BrowserState | null> {
    const target = String(input.path ?? input.url ?? "").trim();
    if (!target) return this.pane.getState();
    this.rememberLocation(sessionId ?? this.chromeSessionId ?? undefined, target);
    const background =
      Boolean(sessionId) &&
      Boolean(this.chromeSessionId) &&
      sessionId !== this.chromeSessionId;
    if (background) return this.pane.getState();
    const root = await this.deps.getFileRoot(sessionId ?? this.chromeSessionId ?? undefined);
    this.started = true;
    const state = await this.pane.navigateAndWait(target, root);
    this.applyGuest();
    if (state) this.deps.onState(state);
    return state;
  }

  action(action: "back" | "forward" | "reload" | "stop"): void {
    this.pane.action(action);
  }

  getState(): BrowserState | null {
    return this.pane.getState();
  }

  getElementPicker(): { enabled: boolean } {
    return { enabled: this.elementPickerEnabled };
  }

  openExternal(): void {
    this.pane.openExternal();
  }

  async setElementPicker(enabled: boolean): Promise<{ enabled: boolean }> {
    const wc = this.requireWebContents();
    this.elementPickerEnabled = enabled;
    if (enabled) {
      await this.cdp.enableElementPicker(wc, (message) => this.handleElementPickerMessage(message));
    } else {
      await this.cdp.disableElementPicker(wc);
    }
    this.deps.onPickerState?.(this.elementPickerEnabled);
    return { enabled: this.elementPickerEnabled };
  }

  async snapshot(): Promise<{ tree: string; url: string; title: string }> {
    const wc = this.requireWebContents();
    return this.cdp.snapshot(wc);
  }

  async screenshot(
    input: { fullPage?: boolean } = {},
    sessionId?: string,
  ): Promise<{ mimeType: string; data: string; path?: string }> {
    const wc = this.requireWebContents();
    const shot = await this.cdp.screenshot(wc, input);
    const scratch = this.deps.getScratchDir?.(sessionId ?? this.chromeSessionId ?? undefined);
    if (!scratch) return shot;
    try {
      mkdirSync(scratch, { recursive: true });
      const path = join(scratch, `browser-screenshot-${Date.now()}.jpg`);
      writeFileSync(path, Buffer.from(shot.data, "base64"));
      return { ...shot, path };
    } catch {
      return shot;
    }
  }

  async click(uid: string): Promise<void> {
    await this.cdp.click(this.requireWebContents(), uid);
  }

  async fill(uid: string, text: string): Promise<void> {
    await this.cdp.fill(this.requireWebContents(), uid, text);
  }

  async evaluate(expression: string): Promise<unknown> {
    return this.cdp.evaluate(this.requireWebContents(), expression);
  }

  console(limit?: number): { messages: ReturnType<BrowserCdp["console"]> } {
    this.ensureCdp();
    return { messages: this.cdp.console(limit) };
  }

  async cdpCommand(method: string, params?: unknown): Promise<unknown> {
    return this.cdp.send(this.requireWebContents(), method, params);
  }

  /**
   * Host `BrowserPreview` facade: plugin must be enabled; the guest loads the
   * workspace file only when that session's chrome is visible (D142).
   */
  async previewWorkspaceFile(
    sessionId: string,
    path: string,
    root: string,
  ): Promise<{ ok: true } | { ok: false; content: string }> {
    if (!this.deps.isPluginLoaded(BROWSER_PLUGIN_ID)) {
      return {
        ok: false,
        content:
          "BrowserPreview: the Browser plugin is disabled. Enable pi.browser in Plugins to preview HTML.",
      };
    }
    this.rememberLocation(sessionId, path);
    const background =
      Boolean(this.chromeSessionId) && this.chromeSessionId !== sessionId;
    if (!background) {
      this.started = true;
      await this.pane.navigateAndWait(path, root);
      this.applyGuest();
    }
    return { ok: true };
  }

  disposeGuest(): void {
    this.elementPickerEnabled = false;
    void this.cdp.disableElementPicker(this.pane.getWebContents() ?? undefined);
    this.cdp.detach(this.pane.getWebContents() ?? undefined);
    this.pane.dispose();
    this.started = false;
    this.hole = null;
    this.holePluginId = null;
  }

  private guestBounds(): BrowserRect | null {
    if (!this.chrome?.visible || !this.hole) return null;
    if (this.holePluginId !== this.chrome.pluginId) return null;
    return clampGuestBounds(this.chrome.bounds, this.hole);
  }

  private applyGuest(): void {
    const bounds = this.guestBounds();
    const url = this.pane.getState()?.url;
    if (!bounds || (!this.started && !url)) {
      this.pane.setVisible(false);
      return;
    }
    this.pane.setBounds(bounds);
    this.pane.setVisible(true);
  }

  private async rebindSession(sessionId: string): Promise<void> {
    const location = this.locations.get(sessionId);
    if (!location) return;
    const root = await this.deps.getFileRoot(sessionId);
    this.started = true;
    await this.pane.navigateAndWait(location, root);
    this.applyGuest();
  }

  private requireWebContents() {
    const wc = this.pane.getWebContents();
    if (!wc || wc.isDestroyed()) {
      throw Object.assign(new Error("browser guest is not available"), {
        code: "UNAVAILABLE",
      });
    }
    return wc;
  }

  private ensureCdp(): void {
    const wc = this.pane.getWebContents();
    if (wc && !wc.isDestroyed()) void this.cdp.attach(wc);
  }

  private handleElementPickerMessage(message: unknown): void {
    if (!message || typeof message !== "object") return;
    const record = message as Record<string, unknown>;
    if (record.type !== "action") return;
    const action = record.action;
    if (action === "cancel") {
      void this.setElementPicker(false).catch(() => {
        this.deps.onPickerState?.(false);
      });
      return;
    }
    if (action !== "add" && action !== "copy") return;
    const selection = parseBrowserSelection(record.selection);
    if (!selection) return;
    const comment = parseBrowserSelectionComment(record.comment);
    if (isBrowserTextSelection(selection)) {
      if (action === "add") this.deps.onTextSelection?.(selection, comment);
      else this.deps.onTextCopy?.(selection);
      return;
    }
    if (action === "add") this.deps.onElementSelection?.(selection, comment);
    else this.deps.onElementCopy?.(selection);
  }
}
