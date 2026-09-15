# ADR 0257: Adaptive Thinking Level (Session-Layer Auto Mode)

- Status: Draft (pending review)
- Date: 2026-09-15
- Decision makers: PI-Desktop core
- Supersedes: ADR 0114 (provider/model bindings and thinking configuration),
  ADR 0144 (user-configurable thinking-level overrides), ADR 0221 (canonical
  thinking-level values)
- Related: ADR 0194 (subagent thinking parameter omission), ADR 0215 (agent
  extensions as plugin contributions), ADR 0237 (official plugin surface)

## Context

Thinking levels are a frozen protocol enum (`off`, `minimal`, `low`, `medium`,
`high`, `xhigh`, `max`). The Composer previously required users to choose one
manually for every session. That makes a high level unnecessarily expensive for
simple work while leaving complex work at a level that may be too low.

The upstream agent runtime exposes `getThinkingLevel` and `setThinkingLevel` to
extensions. This provides a narrow, auditable way for the agent to raise the
level when a task is ambiguous, requires debugging, changes risky files, or
needs multi-step synthesis.

## Decision

`auto` is a session-layer mode and is never added to the wire or persisted
thinking-level enum.

1. New sessions and drafts default to `auto` when the global default is enabled.
   The auto baseline is `medium`; a model without reasoning capability resolves to
   `off` and does not show `auto` in its menu. Users can still select `off` or a
   concrete thinking level manually.
2. Before each provider request, the runtime sends only a concrete canonical
   level. The session mode and baseline remain separate from provider adapters.
3. The bundled `pi.thinking` extension exposes `get_thinking_level` and
   `set_thinking_level`. A non-persistent change applies to the current turn;
   a persistent change updates the session baseline through the existing session
   configuration contract. Turn-scoped overrides are cleared when the run ends.
4. The global AI settings page provides a switch for the default auto mode. The
   setting is optional and defaults to enabled for existing installs.
5. The Composer displays the selected mode and effective concrete level, for
   example `auto · medium`, so the user can see what will be sent.

## Consequences

The existing thinking-level wire enum and provider adapters remain compatible.
Existing persisted sessions without the additive mode field retain manual
semantics. Auto mode starts with no thinking cost and lets the agent spend
additional thinking tokens only when it explicitly raises the level. The agent's
static extension guidance is loaded once per session and does not change the
per-turn system prompt, preserving prompt-cache prefixes.

## Validation

- Unit tests cover auto resolution, model capability fallbacks, and session
  mode round-tripping.
- `E2E-SESSION-auto-thinking-resolves-per-turn` covers the default mode,
  concrete provider requests, turn-scoped rollback, persistent changes, and
  Composer display.
