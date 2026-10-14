import { constants } from 'node:fs'
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_BROWSER_PREFERENCES } from '../../../../shared/browser/browserPreferences'
import { DEFAULT_TYPOGRAPHY } from '../../../../shared/typography/typographyPreferences'
import { DEFAULT_DESKTOP_CHAT_PREFERENCES, DESKTOP_CHAT_OUTLINE_POSITIONS } from '../../../shared/desktopApi'
import { LexoraConfigStore } from '../LexoraConfigStore'

async function createConfigStore() {
  const directory = await createTemporaryDirectory('lexora-config-test-')
  const configPath = join(directory, '.lexora', 'config.toml')

  return {
    configPath,
    store: new LexoraConfigStore({ configPath }),
  }
}

describe('lexoraConfigStore', () => {
  it('migrates the old identity once, retains it on failure and keeps unrelated TOML', async () => {
    const { configPath, store } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    const legacy = '[desktop.agent_profile]\nname="旧助手"\navatar=""\n[custom]\nkeep=true\n'
    await writeFile(configPath, legacy)
    const system = vi.fn()
    await expect(store.migrateAgentProfile(async () => {
      throw new Error('database unavailable')
    }, system)).rejects.toThrow('database unavailable')
    expect(await readFile(configPath, 'utf8')).toBe(legacy)
    const migrate = vi.fn(async () => {})
    await store.migrateAgentProfile(migrate, system)
    expect(migrate).toHaveBeenCalledWith({ name: '旧助手', avatar: '' })
    expect(await readFile(configPath, 'utf8')).not.toContain('agent_profile')
    expect(await readFile(configPath, 'utf8')).toContain('keep = true')
    await store.update({ desktop: { theme: 'dark' } })
    await store.migrateAgentProfile(migrate, system)
    expect(migrate).toHaveBeenCalledTimes(1)
    expect(system).not.toHaveBeenCalled()
  })

  it('resolves a synchronized identity from the user and system profile before migration', async () => {
    const { configPath, store } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[desktop.agent_profile]\nsync_with_user_profile=true\n[desktop.profile]\nuser_name="用户名称"\navatar="custom-avatar"\n')
    const migrate = vi.fn(async () => {})
    await store.migrateAgentProfile(migrate, async () => ({ username: 'system', displayName: 'System User', hostname: 'PC', avatarUrl: null }))
    expect(migrate).toHaveBeenCalledWith({ name: '用户名称', avatar: 'custom-avatar' })
  })

  it('defaults legacy typography, merges independent choices and resets without losing other preferences', async () => {
    const { configPath, store } = await createConfigStore()
    expect((await store.read()).desktop.typography).toEqual(DEFAULT_TYPOGRAPHY)
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[desktop.chat]\nwelcome="none"\n[desktop.typography]\nfuture=true\n')
    expect((await store.read()).desktop.typography).toEqual(DEFAULT_TYPOGRAPHY)
    await store.update({ desktop: { typography: { bodyFont: 'Noto Serif CJK SC', bodySize: 15 } } })
    await store.update({ desktop: { typography: { codeFont: 'Consolas' } } })
    const restarted = new LexoraConfigStore({ configPath })
    expect((await restarted.read()).desktop.typography).toEqual({ ...DEFAULT_TYPOGRAPHY, bodyFont: 'Noto Serif CJK SC', bodySize: 15, codeFont: 'Consolas' })
    const saved = await readFile(configPath, 'utf8')
    await expect(store.update({ desktop: { typography: { bodySize: 100 } } })).rejects.toThrow()
    expect(await readFile(configPath, 'utf8')).toBe(saved)
    await restarted.update({ desktop: { typography: { ...DEFAULT_TYPOGRAPHY } } })
    expect((await store.read()).desktop).toMatchObject({ typography: DEFAULT_TYPOGRAPHY, chat: { welcome: 'none' } })
    expect(await readFile(configPath, 'utf8')).toContain('future = true')
  })

  it('enables pasted text attachments for new and legacy profiles and preserves an opt-out across updates and restart', async () => {
    const { configPath, store } = await createConfigStore()
    expect((await store.read()).desktop.chat.pasteTextAsAttachment).toBe(true)
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[desktop.chat]\nwelcome = "none"\nfuture = true\n')
    expect((await store.read()).desktop.chat.pasteTextAsAttachment).toBe(true)
    await store.update({ desktop: { chat: { pasteTextAsAttachment: false } } })
    await store.update({ desktop: { chat: { outlinePosition: 'center-left' } } })
    expect((await new LexoraConfigStore({ configPath }).read()).desktop.chat).toEqual({
      ...DEFAULT_DESKTOP_CHAT_PREFERENCES,
      outlinePosition: 'center-left',
      pasteTextAsAttachment: false,
      welcome: 'none',
      welcomeEnabled: false,
    })
    const saved = await readFile(configPath, 'utf8')
    expect(saved).toContain('paste_text_as_attachment = false')
    expect(saved).toContain('future = true')
    await writeFile(configPath, '[desktop.chat]\npaste_text_as_attachment = "false"\n')
    await expect(store.read()).rejects.toThrow()
  })

  it('enables update notifications for old profiles and preserves an opt-out across other settings and restart', async () => {
    const { store, configPath } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[desktop]\nnotifications_enabled = false\ntheme = "dark"\n[custom]\nkeep = true\n')
    expect((await store.read()).desktop.updateNotificationsEnabled).toBe(true)
    await store.update({ desktop: { updateNotificationsEnabled: false } })
    await store.update({ desktop: { language: 'en-US' } })
    expect((await new LexoraConfigStore({ configPath }).read()).desktop).toMatchObject({ updateNotificationsEnabled: false, notificationsEnabled: false, theme: 'dark' })
    expect(await readFile(configPath, 'utf8')).toContain('keep = true')
  })

  it('defaults existing profiles to three retries and round-trips disabled, finite and unlimited limits', async () => {
    const { store, configPath } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[runtime]\ncache_warming = "streaming"\nfuture = true\n')
    expect((await store.read()).runtime).toEqual({ cacheWarming: 'streaming', codemode: false, modelRetryLimit: 3 })
    for (const modelRetryLimit of [0, 7, 'unlimited'] as const) {
      await store.update({ runtime: { modelRetryLimit } })
      await store.update({ desktop: { language: 'en-US' } })
      expect((await new LexoraConfigStore({ configPath }).read()).runtime).toEqual({ cacheWarming: 'streaming', codemode: false, modelRetryLimit })
      expect(await readFile(configPath, 'utf8')).toContain('future = true')
    }
    const saved = await readFile(configPath, 'utf8')
    expect(saved).toContain('model_retry_limit = "unlimited"')
    for (const modelRetryLimit of [-1, 1.5, Infinity, Number.NaN, Number.MAX_SAFE_INTEGER + 1, 'invalid'] as const)
      await expect(store.update({ runtime: { modelRetryLimit: modelRetryLimit as never } })).rejects.toThrow()
    await expect(store.update({ runtime: { modelRetryLimit: 0 } }, () => {
      throw new Error('Apply failed')
    })).rejects.toThrow()
    expect(await readFile(configPath, 'utf8')).toBe(saved)
  })

  it('defaults warming off and preserves runtime preferences across saves and restart', async () => {
    const { store, configPath } = await createConfigStore()
    expect((await store.read()).runtime.cacheWarming).toBe('off')
    await store.update({ runtime: { cacheWarming: 'streaming' } })
    await store.update({ desktop: { language: 'en-US' } })
    expect((await new LexoraConfigStore({ configPath }).read()).runtime.cacheWarming).toBe('streaming')
    const saved = await readFile(configPath, 'utf8')
    expect(saved).toMatch(/\[runtime\][\s\S]*cache_warming = "streaming"/)
    await expect(store.update({ runtime: { cacheWarming: 'idle' as never } })).rejects.toThrow()
    expect(await readFile(configPath, 'utf8')).toBe(saved)
    await expect(store.update({ runtime: { cacheWarming: 'off' } }, () => {
      throw new Error('Apply failed')
    })).rejects.toThrow()
    expect(await readFile(configPath, 'utf8')).toBe(saved)
  })

  it('defaults existing profiles to the upper right and persists every outline position without changing other settings', async () => {
    const { configPath, store } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[desktop]\ntheme = "dark"\nwelcome_variant = "writing"\n[custom]\nkeep = true\n')
    const original = await store.read()
    expect(original.desktop.chat).toEqual(DEFAULT_DESKTOP_CHAT_PREFERENCES)
    await store.update({ desktop: { chat: { welcome: 'none' } } })
    for (const outlinePosition of DESKTOP_CHAT_OUTLINE_POSITIONS) {
      await store.update({ desktop: { chat: { outlinePosition } } })
      const restored = await new LexoraConfigStore({ configPath }).read()
      expect(restored).toEqual({
        ...original,
        desktop: { ...original.desktop, chat: { ...DEFAULT_DESKTOP_CHAT_PREFERENCES, outlinePosition, welcome: 'none' } },
      })
      expect(await readFile(configPath, 'utf8')).toContain('keep = true')
    }
  })

  it('persists permission mode, defaults legacy profiles, and rejects invalid values without a partial write', async () => {
    const { configPath, store } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[desktop.chat]\nwelcome = "random"\n')
    expect((await store.read()).desktop.chat.permissionMode).toBe('policy_approval')

    await store.update({ desktop: { chat: { permissionMode: 'full_access' } } })
    expect(await readFile(configPath, 'utf8')).toContain('permission_mode = "full_access"')
    expect((await new LexoraConfigStore({ configPath }).read()).desktop.chat.permissionMode).toBe('full_access')

    const saved = await readFile(configPath, 'utf8')
    await expect(store.update({ desktop: { chat: { permissionMode: 'invalid' as never } } })).rejects.toThrow()
    expect(await readFile(configPath, 'utf8')).toBe(saved)

    await writeFile(configPath, '[desktop.chat]\npermission_mode = "invalid"\n')
    await expect(store.read()).rejects.toThrow()
  })

  it('migrates browser preferences with defaults and preserves unrelated settings across updates', async () => {
    const { configPath, store } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[desktop]\nlanguage = "en-US"\n[browser]\nfuture = true\n')
    expect((await store.read()).browser).toEqual(DEFAULT_BROWSER_PREFERENCES)
    await store.update({ browser: { screenshotDestination: 'clipboard' } })
    await store.update({ browser: { defaultZoomFactor: 1.25 } })
    await store.update({ browser: { freezeForeground: true, freezeDelaySeconds: 120 } })
    await store.update({ browser: { freezeBackground: false } })
    const restarted = new LexoraConfigStore({ configPath })
    expect((await restarted.read()).browser).toEqual({ ...DEFAULT_BROWSER_PREFERENCES, screenshotDestination: 'clipboard', defaultZoomFactor: 1.25, freezeBackground: false, freezeForeground: true, freezeDelaySeconds: 120 })
    expect((await restarted.read()).desktop.language).toBe('en-US')
    expect(await readFile(configPath, 'utf8')).toContain('future = true')
    const saved = await readFile(configPath, 'utf8')
    await expect(store.update({ browser: { defaultZoomFactor: 0 } })).rejects.toThrow()
    for (const freezeDelaySeconds of [0, 4, 3601, 10.5])
      await expect(store.update({ browser: { freezeDelaySeconds } })).rejects.toThrow()
    expect(await readFile(configPath, 'utf8')).toBe(saved)
  })

  it('persists shortcut overrides, disabled commands and reset without losing unrelated settings', async () => {
    const { store, configPath } = await createConfigStore()
    expect((await store.read()).desktop.keybindings).toEqual({})
    await store.update({ desktop: { keybindings: { 'task.new': 'Mod+Alt+N', 'view.close': '' }, theme: 'dark' } })
    const reopened = new LexoraConfigStore({ configPath })
    expect((await reopened.read()).desktop.keybindings).toEqual({ 'task.new': 'Mod+Alt+N', 'view.close': '' })
    const before = await readFile(configPath, 'utf8')
    await expect(reopened.update({ desktop: { keybindings: { 'task.new': 'not a shortcut' } } })).rejects.toThrow()
    expect(await readFile(configPath, 'utf8')).toBe(before)
    await reopened.update({ desktop: { keybindings: {} } })
    expect((await reopened.read()).desktop).toMatchObject({ theme: 'dark', keybindings: {} })
  })

  it('defaults existing profiles to system proxy and preserves the custom address across mode changes', async () => {
    const { configPath, store } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[desktop]\nlanguage = "en-US"\n[future]\nvalue = true\n')
    expect((await store.read()).proxy).toEqual({ mode: 'system', server: '' })
    await store.update({ proxy: { mode: 'custom', server: 'http://127.0.0.1:7890' } })
    await store.update({ proxy: { mode: 'direct', server: 'http://127.0.0.1:7890' } })
    expect((await store.read()).proxy).toEqual({ mode: 'direct', server: 'http://127.0.0.1:7890' })
    expect(await readFile(configPath, 'utf8')).toContain('[future]')
    expect((await store.read()).desktop.language).toBe('en-US')
  })

  it.each(['independent', 'space'] as const)('defaults global panels off and persists %s mode and visibility independently across restarts', async (mode) => {
    const { configPath, store } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[desktop]\nlanguage = "en-US"\n[future]\nvalue = true\n')
    expect((await store.read()).desktop).toMatchObject({ contextPanelMode: 'task', contextPanelGlobal: false })
    await store.update({ desktop: { contextPanelMode: mode, contextPanelGlobal: true } })
    await store.update({ desktop: { theme: 'dark' } })
    const restarted = new LexoraConfigStore({ configPath })
    expect((await restarted.read()).desktop).toMatchObject({
      contextPanelMode: mode,
      contextPanelGlobal: true,
      language: 'en-US',
      theme: 'dark',
    })
    const content = await readFile(configPath, 'utf8')
    expect(content).toContain('context_panel_global = true')
    expect(content).toContain('[future]')
    expect((await restarted.update({ desktop: { contextPanelMode: 'task' } })).desktop)
      .toMatchObject({ contextPanelMode: 'task', contextPanelGlobal: true })
    expect((await restarted.update({ desktop: { contextPanelGlobal: false } })).desktop)
      .toMatchObject({ contextPanelMode: 'task', contextPanelGlobal: false })
  })

  it('restores the applied configuration when applying a setting fails without changing the saved profile', async () => {
    const { store } = await createConfigStore()
    const previous = await store.read()
    const changes: string[] = []
    store.onDidChange(change => changes.push(change.kind))
    let active = previous.proxy
    await expect(store.update({ proxy: { mode: 'custom', server: 'http://127.0.0.1:7890' } }, async (next) => {
      active = next.proxy
      if (next.proxy.mode === 'custom')
        throw new Error('Proxy configuration unavailable')
    })).rejects.toThrow('Proxy configuration unavailable')
    expect(active).toEqual(previous.proxy)
    expect(await store.read()).toEqual(previous)
    expect(changes).toEqual(['apply-failed', 'rolled-back'])
    expect(store.snapshot.applied).toEqual(previous)
  })
  it('updates only requested settings and writes a private TOML file atomically', async () => {
    const { configPath, store } = await createConfigStore()
    await expect(store.read()).resolves.toMatchObject({
      desktop: { theme: 'system', chat: { outlinePosition: 'top-right', permissionMode: 'policy_approval', welcome: 'random' } },
      pet: { alwaysOnTop: true, enabled: true, rememberPosition: true },
    })

    const updated = await store.update({
      desktop: {
        theme: 'dark',
        minimizeToTrayOnClose: false,
        chat: { welcome: 'writing' },
      },
      pet: { alwaysOnTop: false, enabled: false, rememberPosition: false },
    })

    expect(updated.desktop).toEqual({
      contextPanelMode: 'task',
      contextPanelGlobal: false,
      contextPanelAutoCollapse: false,
      minimizeToTrayOnClose: false,
      keybindings: {},
      backgroundCloseNoticeShown: false,
      pluginAuthor: '',
      chat: { ...DEFAULT_DESKTOP_CHAT_PREFERENCES, welcome: 'writing' },
      taskSidebarPinnedItems: [],
      taskSidebar: {
        collapsed: false,
        collapsedSections: [],
        collapsedSpaces: [],
        width: null,
      },
      typography: DEFAULT_TYPOGRAPHY,
      developerToolsEnabled: false,
      language: 'zh-CN',
      launchAtLogin: false,
      notificationsEnabled: true,
      subtaskNotificationsEnabled: true,
      updateNotificationsEnabled: true,
      autoDownloadUpdates: true,
      notifyWhenFocused: false,
      profile: {
        avatar: '',
        deviceName: '',
        userName: '',
      },
      sidebarCollapsed: false,
      theme: 'dark',
    })
    const content = await readFile(configPath, 'utf8')
    expect(content).toContain('[desktop]')
    expect(content).toContain('minimize_to_tray_on_close = false')
    expect(content).toContain('[pet]')
    expect(content).toContain('always_on_top = false')
    expect(content).toContain('enabled = false')
    expect(content).toContain('remember_position = false')
    await expect(store.read()).resolves.toEqual(updated)
    expect(content).toContain('background_close_notice_shown = false')
    expect(content).toContain('task_sidebar_pinned_items = []')
    expect(content).toContain('developer_tools_enabled = false')
    expect(content).toContain('launch_at_login = false')
    expect(content).toContain('notifications_enabled = true')
    expect(content).toContain('notify_when_focused = false')
    expect(content).toContain('sidebar_collapsed = false')
    expect(content).toContain('[desktop.chat]')
    expect(content).toContain('welcome = "writing"')
    expect(content).not.toContain('[agent.codex]')
    // Windows private-file permissions are enforced by ACLs, not POSIX mode bits.
    if (process.platform !== 'win32')
      expect((await stat(configPath)).mode & 0o777).toBe(0o600)

    await expect(access(`${configPath}.tmp`, constants.F_OK)).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('restores the task sidebar layout preferences across restarts', async () => {
    const { configPath, store } = await createConfigStore()

    await expect(store.read()).resolves.toMatchObject({
      desktop: {
        taskSidebar: {
          collapsed: false,
          collapsedSections: [],
          collapsedSpaces: [],
          width: null,
        },
      },
    })

    await store.update({
      desktop: {
        taskSidebar: {
          collapsed: true,
          collapsedSections: ['tasks'],
          collapsedSpaces: ['space-a'],
          width: 336,
        },
      },
    })

    const restarted = new LexoraConfigStore({ configPath })
    await expect(restarted.read()).resolves.toMatchObject({
      desktop: {
        taskSidebar: {
          collapsed: true,
          collapsedSections: ['tasks'],
          collapsedSpaces: ['space-a'],
          width: 336,
        },
      },
    })
    const content = await readFile(configPath, 'utf8')
    expect(content).toContain('task_sidebar')
    expect(content).toContain('collapsed = true')
    expect(content).toContain('collapsed_sections')
    expect(content).toContain('"tasks"')
    expect(content).toContain('collapsed_spaces')
    expect(content).toContain('"space-a"')
    expect(content).toContain('width = 336')

    await expect(store.update({
      desktop: { taskSidebar: { collapsedSpaces: ['space-b'] } },
    })).resolves.toMatchObject({
      desktop: {
        taskSidebar: {
          collapsed: true,
          collapsedSections: ['tasks'],
          collapsedSpaces: ['space-b'],
          width: 336,
        },
      },
    })
  })

  it('persists the ordered top-level task sidebar pins', async () => {
    const { configPath, store } = await createConfigStore()

    await expect(store.update({
      desktop: {
        taskSidebarPinnedItems: [
          { id: 'space-a', kind: 'space' },
          { id: 'conversation-a', kind: 'conversation' },
        ],
      },
    })).resolves.toMatchObject({
      desktop: {
        taskSidebarPinnedItems: [
          { id: 'space-a', kind: 'space' },
          { id: 'conversation-a', kind: 'conversation' },
        ],
      },
    })

    await expect(store.read()).resolves.toMatchObject({
      desktop: {
        taskSidebarPinnedItems: [
          { id: 'space-a', kind: 'space' },
          { id: 'conversation-a', kind: 'conversation' },
        ],
      },
    })
    const content = await readFile(configPath, 'utf8')
    expect(content).toContain('[[desktop.task_sidebar_pinned_items]]')
    expect(content).toContain('kind = "space"')
    expect(content).toContain('id = "conversation-a"')
  })

  it('uses defaults for omitted chat preferences and preserves unknown preferences on updates', async () => {
    const { configPath, store } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[desktop.chat]\nwelcome = "none"\nfuture = true\n')

    await expect(store.read()).resolves.toMatchObject({
      desktop: { chat: { outlinePosition: 'top-right', permissionMode: 'policy_approval', welcome: 'none' } },
    })

    await store.update({ desktop: { theme: 'dark' } })
    const saved = await readFile(configPath, 'utf8')
    expect(saved).toContain('welcome = "none"')
    expect(saved).toContain('future = true')
  })

  it('preserves config sections owned by future or remote capabilities', async () => {
    const { configPath, store } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[api]\nbase_url = "https://lexora.example"\n\n[desktop]\ntheme = "system"\nfuture_setting = true\n')

    await store.update({ desktop: { theme: 'dark' } })

    const content = await readFile(configPath, 'utf8')
    expect(content).toContain('[api]')
    expect(content).toContain('base_url = "https://lexora.example"')
    expect(content).toContain('future_setting = true')
  })

  it('persists and restores desktop user profile settings across restarts', async () => {
    const { configPath, store } = await createConfigStore()
    const initial = await store.read()
    expect(initial.desktop.profile).toEqual({ userName: '', deviceName: '', avatar: '' })

    await store.update({
      desktop: {
        profile: {
          userName: 'Alice',
          deviceName: 'Alice-Laptop',
          avatar: 'data:image/png;base64,abc',
        },
      },
    })

    const restarted = new LexoraConfigStore({ configPath })
    const restored = await restarted.read()
    expect(restored.desktop.profile).toEqual({
      userName: 'Alice',
      deviceName: 'Alice-Laptop',
      avatar: 'data:image/png;base64,abc',
    })

    const saved = await readFile(configPath, 'utf8')
    expect(saved).toContain('user_name = "Alice"')
    expect(saved).toContain('device_name = "Alice-Laptop"')
  })

  it('preserves welcome content and selection across concurrent partial writes and restart', async () => {
    const { configPath, store } = await createConfigStore()
    const initial = await store.read()
    expect(initial.desktop.chat.welcomeItems).toEqual(DEFAULT_DESKTOP_CHAT_PREFERENCES.welcomeItems)

    const updated = await store.update({
      desktop: {
        chat: {
          welcome: 'custom-123',
          welcomeItems: [
            ...initial.desktop.chat.welcomeItems,
            { kind: 'custom', id: 'custom-123', text: '新的一天，尽情创造' },
          ],
        },
      },
    })
    const reloadedConfig = await new LexoraConfigStore({ configPath }).read()
    expect(reloadedConfig.desktop.chat).toEqual(updated.desktop.chat)

    const concurrent1 = store.update({
      desktop: {
        chat: {
          welcomeItems: [
            ...reloadedConfig.desktop.chat.welcomeItems,
            { kind: 'custom', id: 'custom-456', text: '第二条自定义' },
          ],
        },
      },
    })
    const concurrent2 = store.update({
      desktop: {
        chat: {
          welcome: 'custom-456',
        },
      },
    })
    await Promise.all([concurrent1, concurrent2])
    const finalConfig = await (new LexoraConfigStore({ configPath })).read()
    expect(finalConfig.desktop.chat.welcome).toBe('custom-456')
    expect(finalConfig.desktop.chat.welcomeItems).toEqual([
      ...initial.desktop.chat.welcomeItems,
      { kind: 'custom', id: 'custom-123', text: '新的一天，尽情创造' },
      { kind: 'custom', id: 'custom-456', text: '第二条自定义' },
    ])
  })

  it('migrates stored welcome text, preserves disabled preferences and does not restore deleted messages', async () => {
    const { configPath, store } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, `
[desktop.chat]
welcome = "custom-kept"
[[desktop.chat.welcome_items]]
id = "writing"
text = "今天想一起完成什么？"
[[desktop.chat.welcome_items]]
id = "custom-kept"
text = "保留我的内容"
`)
    const loaded = await store.read()
    expect(loaded.desktop.chat.welcomeItems).toEqual([
      { kind: 'preset', id: 'writing' },
      { kind: 'custom', id: 'custom-kept', text: '保留我的内容' },
    ])
    const disabled = await store.update({ desktop: { chat: { welcomeEnabled: false } } })
    expect(disabled.desktop.chat).toMatchObject({ welcomeEnabled: false, welcome: 'custom-kept', welcomeItems: loaded.desktop.chat.welcomeItems })
    const restarted = new LexoraConfigStore({ configPath })
    expect((await restarted.read()).desktop.chat).toEqual(disabled.desktop.chat)
    await restarted.update({ desktop: { chat: { welcome: 'writing' } } })
    const remaining = [{ kind: 'custom' as const, id: 'custom-kept', text: '保留我的内容' }]
    const deleted = await restarted.update({ desktop: { chat: { welcomeItems: remaining } } })
    expect(deleted.desktop.chat).toMatchObject({ welcome: 'random', welcomeEnabled: false, welcomeItems: remaining })
    expect((await store.read()).desktop.chat).toEqual(deleted.desktop.chat)
    const empty = await store.update({ desktop: { chat: { welcomeItems: [] } } })
    expect(empty.desktop.chat).toMatchObject({ welcome: 'none', welcomeEnabled: false, welcomeItems: [] })
    expect((await restarted.read()).desktop.chat.welcomeItems).toEqual([])
    await store.update({ desktop: { chat: { welcomeEnabled: true } } })
    expect((await restarted.read()).desktop.chat).toMatchObject({ welcomeEnabled: true, welcome: 'none', welcomeItems: [] })
  })

  it('rejects malformed TOML with a stable configuration error', async () => {
    const { configPath, store } = await createConfigStore()
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, '[desktop\ntheme = "dark"')

    await expect(store.read()).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    })
  })
})

it('persists an optional Unicode plugin signature without changing profile or previous data on invalid input', async () => {
  const { store, configPath } = await createConfigStore()
  expect((await store.read()).desktop.pluginAuthor).toBe('')
  await store.update({ desktop: { pluginAuthor: '山雨海 · Équipe 🎨', profile: { userName: '个人名称' } } })
  const saved = await readFile(configPath, 'utf8')
  const reopened = new LexoraConfigStore({ configPath })
  expect((await reopened.read()).desktop.pluginAuthor).toBe('山雨海 · Équipe 🎨')
  await expect(store.update({ desktop: { pluginAuthor: '名'.repeat(81) } })).rejects.toThrow()
  expect(await readFile(configPath, 'utf8')).toBe(saved)
  await store.update({ desktop: { pluginAuthor: '' } })
  expect((await reopened.read()).desktop.profile.userName).toBe('个人名称')
  expect((await reopened.read()).desktop.pluginAuthor).toBe('')
})
