import { Buffer } from 'node:buffer'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { isLocalNamedPipe as isWindowsPipe } from '../../../shared/platform/localEndpoint'
import { resolveBuddyLaunchOverrides, resolveBuddyRuntimePaths } from '../paths'

const BASE_OPTIONS = {
  defaultUserData: '/home/lexora/.config/XTLaw',
  desktopName: 'io.github.qayong.XTLaw',
  isPackaged: false,
  platform: 'linux',
  temporaryDirectory: '/tmp',
  userHome: '/home/lexora',
  userId: 1000,
  xdgCacheHome: '/var/cache/user',
  xdgConfigHome: '/var/config/user',
  xdgRuntimeDirectory: '/run/user/1000',
  xdgStateHome: '/var/state/user',
} as const

describe('resolveBuddyRuntimePaths', () => {
  it('ignores inherited Lexora launch overrides and accepts only XTLaw identity overrides', () => {
    const inherited = { LEXORA_HOME: '/home/lexora/.lexora', LEXORA_BUDDY_PROFILE: 'stable', LEXORA_BUDDY_PET_SOCKET: '/old/pet.sock' }
    const ignored = resolveBuddyLaunchOverrides(inherited)
    expect(Object.values(ignored).every(value => value === undefined)).toBe(true)
    expect(resolveBuddyRuntimePaths({ ...BASE_OPTIONS, ...ignored }).lexoraHome).toBe('/home/lexora/.xtlaw-dev')
    expect(resolveBuddyLaunchOverrides({ ...inherited, XTLAW_HOME: '/tmp/xtlaw', XTLAW_BUDDY_PROFILE: 'test' })).toMatchObject({ lexoraHomeOverride: '/tmp/xtlaw', profileOverride: 'test' })
  })

  it('rejects reopening known Lexora data through explicit overrides in any profile', () => {
    for (const profileOverride of ['stable', 'development', 'test']) {
      for (const root of ['/home/lexora/.lexora', '/home/lexora/.lexora-dev/buddy', '/home/lexora'])
        expect(() => resolveBuddyRuntimePaths({ ...BASE_OPTIONS, profileOverride, lexoraHomeOverride: root })).toThrow('must not overlap Lexora')
    }
    expect(() => resolveBuddyRuntimePaths({ ...BASE_OPTIONS, userDataOverride: '/home/lexora/.config/Lexora Buddy' })).toThrow('must not overlap Lexora')
    expect(() => resolveBuddyRuntimePaths({ ...BASE_OPTIONS, nativePetSocketOverride: '/run/user/1000/lexora-buddy/native-pet.sock' })).toThrow('must not overlap Lexora')
  })

  it('isolates macOS profiles and bounds Unix socket paths independently of long temporary paths', () => {
    const options = { ...BASE_OPTIONS, platform: 'darwin', userHome: '/Users/lexora', defaultUserData: '/Users/lexora/Library/Application Support/XTLaw', temporaryDirectory: `/private/var/folders/${'a'.repeat(120)}` } as const
    const stable = resolveBuddyRuntimePaths({ ...options, isPackaged: true })
    const development = resolveBuddyRuntimePaths(options)
    const firstTest = resolveBuddyRuntimePaths({ ...options, smokeTest: true, lexoraHomeOverride: '/private/tmp/first' })
    const secondTest = resolveBuddyRuntimePaths({ ...options, smokeTest: true, lexoraHomeOverride: '/private/tmp/second' })
    expect(stable.userData).toBe(options.defaultUserData)
    expect(stable.sessionData).toBe('/Users/lexora/Library/Caches/xtlaw/chromium')
    expect(new Set([stable, development, firstTest, secondTest].map(paths => paths.browserAdapterSocket)).size).toBe(4)
    for (const paths of [stable, development, firstTest, secondTest]) {
      expect(Buffer.byteLength(paths.browserAdapterSocket, 'utf8')).toBeLessThanOrEqual(100)
      expect(paths.nativePetSocket).toBeNull()
    }
    expect(development.userData).not.toBe(stable.userData)
    expect(firstTest.sessionData).toBe('/private/tmp/first/.runtime/cache/chromium')
    expect(firstTest.logs).toBe('/private/tmp/first/.runtime/state/logs')
  })

  it('isolates interactive development from the installed application', () => {
    expect(resolveBuddyRuntimePaths(BASE_OPTIONS)).toEqual({
      agentDirectory: '/home/lexora/.xtlaw-dev/buddy/agent',
      appName: 'XTLaw Dev',
      browserAdapterSocket: '/run/user/1000/xtlaw-dev/browser-adapter.sock',
      buddyHome: '/home/lexora/.xtlaw-dev/buddy',
      configPath: '/home/lexora/.xtlaw-dev/config.toml',
      crashDumps: '/var/state/user/xtlaw-dev/crashes',
      desktopName: 'io.github.qayong.XTLaw.Development',
      lexoraHome: '/home/lexora/.xtlaw-dev',
      logs: '/var/state/user/xtlaw-dev/logs',
      namespace: 'xtlaw-dev',
      nativePetSocket: '/run/user/1000/xtlaw-dev/native-pet.sock',
      nativePetState: '/var/state/user/xtlaw-dev/pet-state.json',
      profile: 'development',
      sessionData: '/var/cache/user/xtlaw-dev/chromium',
      userData: '/var/config/user/xtlaw-dev/electron',
      windowState: '/var/state/user/xtlaw-dev/window-state.json',
    })
  })

  it('uses independent installed application paths and XTLaw Electron userData', () => {
    expect(resolveBuddyRuntimePaths({
      ...BASE_OPTIONS,
      isPackaged: true,
    })).toEqual({
      agentDirectory: '/home/lexora/.xtlaw/buddy/agent',
      appName: 'XTLaw',
      browserAdapterSocket: '/run/user/1000/xtlaw/browser-adapter.sock',
      buddyHome: '/home/lexora/.xtlaw/buddy',
      configPath: '/home/lexora/.xtlaw/config.toml',
      crashDumps: '/var/state/user/xtlaw/crashes',
      desktopName: 'io.github.qayong.XTLaw',
      lexoraHome: '/home/lexora/.xtlaw',
      logs: '/var/state/user/xtlaw/logs',
      namespace: 'xtlaw',
      nativePetSocket: '/run/user/1000/xtlaw/native-pet.sock',
      nativePetState: '/var/state/user/xtlaw/pet-state.json',
      profile: 'stable',
      sessionData: '/var/cache/user/xtlaw/chromium',
      userData: '/home/lexora/.config/XTLaw',
      windowState: '/var/state/user/xtlaw/window-state.json',
    })
  })

  it('falls back from invalid XDG directories without crossing profile namespaces', () => {
    const paths = resolveBuddyRuntimePaths({
      ...BASE_OPTIONS,
      xdgCacheHome: 'relative-cache',
      xdgConfigHome: 'relative-config',
      xdgRuntimeDirectory: 'relative-runtime',
      xdgStateHome: undefined,
    })

    expect(paths.sessionData).toBe('/home/lexora/.cache/xtlaw-dev/chromium')
    expect(paths.userData).toBe('/home/lexora/.config/xtlaw-dev/electron')
    expect(paths.logs).toBe('/home/lexora/.local/state/xtlaw-dev/logs')
    expect(paths.browserAdapterSocket).toBe('/tmp/xtlaw-dev-uid-1000/browser-adapter.sock')
    expect(paths.nativePetSocket).toBe('/tmp/xtlaw-dev-uid-1000/native-pet.sock')
  })

  it('keeps smoke-test runtime state inside its required temporary product home', () => {
    expect(resolveBuddyRuntimePaths({
      ...BASE_OPTIONS,
      isPackaged: true,
      lexoraHomeOverride: '/tmp/lexora-smoke/home',
      nativePetSocketOverride: '/tmp/lexora-smoke/native-pet.sock',
      smokeTest: true,
    })).toEqual({
      agentDirectory: '/tmp/lexora-smoke/home/buddy/agent',
      appName: 'XTLaw Test',
      browserAdapterSocket: '/tmp/lexora-smoke/home/.runtime/browser-adapter.sock',
      buddyHome: '/tmp/lexora-smoke/home/buddy',
      configPath: '/tmp/lexora-smoke/home/config.toml',
      crashDumps: '/tmp/lexora-smoke/home/.runtime/state/crashes',
      desktopName: 'io.github.qayong.XTLaw.Test',
      lexoraHome: '/tmp/lexora-smoke/home',
      logs: '/tmp/lexora-smoke/home/.runtime/state/logs',
      namespace: 'xtlaw-test',
      nativePetSocket: '/tmp/lexora-smoke/native-pet.sock',
      nativePetState: '/tmp/lexora-smoke/home/.runtime/state/pet-state.json',
      profile: 'test',
      sessionData: '/tmp/lexora-smoke/home/.runtime/cache/chromium',
      userData: '/tmp/lexora-smoke/home/.runtime/electron',
      windowState: '/tmp/lexora-smoke/home/.runtime/state/window-state.json',
    })
  })

  it('honors explicit absolute development overrides', () => {
    const paths = resolveBuddyRuntimePaths({
      ...BASE_OPTIONS,
      lexoraHomeOverride: '/tmp/lexora-home',
      nativePetStateOverride: '/tmp/pet-state.json',
      profileOverride: 'development',
      userDataOverride: '/tmp/electron-user-data',
    })

    expect(paths.lexoraHome).toBe('/tmp/lexora-home')
    expect(paths.nativePetState).toBe('/tmp/pet-state.json')
    expect(paths.userData).toBe('/tmp/electron-user-data')
  })

  it('maps long test roots to a stable short socket directory', () => {
    const lexoraHome = `/tmp/${'deep-browser-run/'.repeat(12)}`
    const paths = resolveBuddyRuntimePaths({
      ...BASE_OPTIONS,
      lexoraHomeOverride: lexoraHome,
      profileOverride: 'test',
    })

    expect(paths.browserAdapterSocket).toMatch(
      /^\/tmp\/xtlaw-test-[\da-f]{16}\/browser-adapter\.sock$/,
    )
    expect(dirname(paths.nativePetSocket!)).toBe(dirname(paths.browserAdapterSocket))
    expect(Buffer.byteLength(paths.browserAdapterSocket, 'utf8')).toBeLessThanOrEqual(100)
    expect(paths.sessionData).toBe(`${lexoraHome}.runtime/cache/chromium`)
    expect(paths.userData).toBe(`${lexoraHome}.runtime/electron`)
  })

  it('rejects unsafe profile and path overrides', () => {
    expect(() => resolveBuddyRuntimePaths({
      ...BASE_OPTIONS,
      profileOverride: 'preview',
    })).toThrow('XTLAW_BUDDY_PROFILE must be stable, development, or test')
    expect(() => resolveBuddyRuntimePaths({
      ...BASE_OPTIONS,
      lexoraHomeOverride: '../lexora',
    })).toThrow('XTLAW_HOME must be an absolute path')
    expect(() => resolveBuddyRuntimePaths({
      ...BASE_OPTIONS,
      profileOverride: 'test',
    })).toThrow('XTLAW_HOME is required for the test profile')
  })

  it('rejects test roots that overlap product profiles, including ancestors and symbolic links', () => {
    for (const root of ['/home/lexora/.xtlaw', '/home/lexora/.xtlaw-dev/buddy', '/home/lexora', '/var/cache/user/xtlaw-dev/chromium']) {
      expect(() => resolveBuddyRuntimePaths({ ...BASE_OPTIONS, profileOverride: 'test', lexoraHomeOverride: root })).toThrow('must not overlap')
    }
    if (process.platform !== 'linux')
      return
    const temporary = mkdtempSync(join(tmpdir(), 'buddy-profile-'))
    try {
      mkdirSync(join(temporary, '.xtlaw'))
      symlinkSync(join(temporary, '.xtlaw'), join(temporary, 'linked'), 'junction')
      expect(() => resolveBuddyRuntimePaths({ ...BASE_OPTIONS, userHome: temporary, profileOverride: 'test', lexoraHomeOverride: join(temporary, 'linked') })).toThrow('must not overlap')
      const testHome = join(temporary, 'test')
      mkdirSync(join(testHome, '.runtime'), { recursive: true })
      symlinkSync(join(temporary, '.xtlaw'), join(testHome, '.runtime/cache'), 'junction')
      expect(() => resolveBuddyRuntimePaths({ ...BASE_OPTIONS, userHome: temporary, profileOverride: 'test', lexoraHomeOverride: testHome })).toThrow('must not overlap')
    }
    finally { rmSync(temporary, { recursive: true, force: true }) }
  })

  it('isolates three test instances and preserves their paths across restarts', () => {
    const options = { ...BASE_OPTIONS, profileOverride: 'test', isPackaged: true }
    const roots = ['one', 'two', 'three'].map(name => `/home/lexora/.lexora-test/runs/task/instances/${name}`)
    const instances = roots.map(lexoraHomeOverride => resolveBuddyRuntimePaths({ ...options, lexoraHomeOverride }))
    for (const key of ['buddyHome', 'configPath', 'userData', 'sessionData', 'browserAdapterSocket', 'nativePetSocket'] as const)
      expect(new Set(instances.map(paths => paths[key])).size).toBe(3)
    expect(resolveBuddyRuntimePaths({ ...options, lexoraHomeOverride: roots[0] })).toEqual(instances[0])
    expect(() => resolveBuddyRuntimePaths({ ...options, lexoraHomeOverride: roots[0], userDataOverride: '/tmp/shared-browser' })).toThrow('state must stay inside')
    expect(() => resolveBuddyRuntimePaths({ ...options, lexoraHomeOverride: roots[0], nativePetSocketOverride: '/run/user/1000/lexora-buddy/native-pet.sock' })).toThrow('must not overlap')
    expect(() => resolveBuddyRuntimePaths({ ...options, smokeTest: true, profileOverride: 'stable', lexoraHomeOverride: roots[0] })).toThrow('requires the test profile')
  })

  it('isolates Windows profiles and uses named pipes without pet paths', () => {
    const options = {
      ...BASE_OPTIONS,
      defaultUserData: 'C:\\Users\\测试 User\\AppData\\Roaming\\XTLaw',
      localAppData: 'C:\\Users\\测试 User\\AppData\\Local',
      platform: 'win32' as const,
      temporaryDirectory: 'C:\\Temp',
      userHome: 'C:\\Users\\测试 User',
    }
    const stable = resolveBuddyRuntimePaths({ ...options, isPackaged: true })
    const development = resolveBuddyRuntimePaths(options)
    const test = resolveBuddyRuntimePaths({
      ...options,
      profileOverride: 'test',
      lexoraHomeOverride: 'C:\\Temp\\隔离 Test',
    })
    expect(stable.buddyHome).toBe('C:\\Users\\测试 User\\.xtlaw\\buddy')
    expect(stable.agentDirectory).toBe('C:\\Users\\测试 User\\.xtlaw\\buddy\\agent')
    expect(stable.logs).toBe('C:\\Users\\测试 User\\AppData\\Local\\XTLaw\\state\\logs')
    expect(development.buddyHome).toBe('C:\\Users\\测试 User\\.xtlaw-dev\\buddy')
    expect(development.userData).toBe('C:\\Users\\测试 User\\AppData\\Roaming\\XTLaw Dev')
    expect(stable.userData).toBe(options.defaultUserData)
    expect(test.userData).toBe('C:\\Temp\\隔离 Test\\.runtime\\electron')
    expect(new Set([stable.browserAdapterSocket, development.browserAdapterSocket, test.browserAdapterSocket]).size).toBe(3)
    for (const paths of [stable, development, test]) {
      expect(isWindowsPipe(paths.browserAdapterSocket)).toBe(true)
      expect(paths.nativePetSocket).toBeNull()
      expect(paths.nativePetState).toBeNull()
    }
    const secondTest = resolveBuddyRuntimePaths({
      ...options,
      profileOverride: 'test',
      lexoraHomeOverride: 'C:\\Temp\\Second Test',
    })
    expect(secondTest.browserAdapterSocket).not.toBe(test.browserAdapterSocket)
    for (const userDataOverride of ['C:\\Users\\测试 User\\AppData\\Roaming\\Lexora Buddy', 'C:\\Users\\测试 User\\AppData\\Local\\Lexora Buddy Dev\\electron'])
      expect(() => resolveBuddyRuntimePaths({ ...options, userDataOverride })).toThrow('must not overlap Lexora')
    expect(() => resolveBuddyRuntimePaths({ ...options, lexoraHomeOverride: 'C:\\Users\\测试 User\\.LEXORA\\buddy' })).toThrow('must not overlap Lexora')
  })
})
