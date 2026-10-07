import type { BuddyRuntimeProfile } from '../../shared/runtime/profile'
import { lstatSync, realpathSync } from 'node:fs'
import process from 'node:process'
import { resolveBuddyPlatform, supportsBuddyFeature } from '../../shared/platform'
import { BUDDY_RUNTIME_PROFILES } from '../../shared/runtime/profile'
import { runtimePathLayouts } from './platform/runtimePathLayouts'

export type { BuddyRuntimeProfile } from '../../shared/runtime/profile'
type PlatformPath = Pick<typeof import('node:path'), 'isAbsolute' | 'normalize' | 'join' | 'relative' | 'dirname' | 'basename' | 'sep'>

export interface BuddyRuntimePathOptions {
  defaultUserData: string
  desktopName: string
  isPackaged: boolean
  localAppData?: string
  platform?: NodeJS.Platform
  lexoraHomeOverride?: string
  nativePetSocketOverride?: string
  nativePetStateOverride?: string
  profileOverride?: string
  smokeTest?: boolean
  temporaryDirectory: string
  userDataOverride?: string
  userHome: string
  userId: number
  xdgCacheHome?: string
  xdgConfigHome?: string
  xdgRuntimeDirectory?: string
  xdgStateHome?: string
}

// Public launch overrides belong to XTLaw. LEXORA_* remains an internal
// child-process interface, never a fallback for the desktop's data identity.
export function resolveBuddyLaunchOverrides(env: NodeJS.ProcessEnv) {
  return {
    lexoraHomeOverride: env.XTLAW_HOME,
    nativePetSocketOverride: env.XTLAW_BUDDY_PET_SOCKET,
    nativePetStateOverride: env.XTLAW_BUDDY_PET_STATE_PATH,
    profileOverride: env.XTLAW_BUDDY_PROFILE,
  }
}

export interface BuddyRuntimePaths {
  agentDirectory: string
  appName: string
  browserAdapterSocket: string
  buddyHome: string
  configPath: string
  crashDumps: string
  desktopName: string
  lexoraHome: string
  logs: string
  namespace: string
  nativePetSocket: string | null
  nativePetState: string | null
  profile: BuddyRuntimeProfile
  sessionData: string
  userData: string
  windowState: string
}

export interface BuddyRuntimeIdentity {
  appName: string
  desktopName: string
  namespace: string
  profile: BuddyRuntimeProfile
}

export function resolveBuddyRuntimePaths(
  options: BuddyRuntimePathOptions,
): BuddyRuntimePaths {
  const identity = resolveBuddyRuntimeIdentity(options)
  const platform = resolveBuddyPlatform(options.platform ?? process.platform)
  const layout = runtimePathLayouts[platform.id]
  const { path } = layout
  const joinPath = path.join
  const lexoraHome = resolveLexoraHome(identity.profile, options, path)
  const runtimeDirectories = layout.resolveDirectories(identity, lexoraHome, options)
  const nativePetSocket = supportsBuddyFeature(platform, 'nativePet')
    ? resolveAbsoluteOverride(
      options.nativePetSocketOverride,
      'XTLAW_BUDDY_PET_SOCKET',
      path,
    ) ?? runtimeDirectories.nativePetSocket
    : null
  const nativePetState = supportsBuddyFeature(platform, 'nativePet')
    ? resolveAbsoluteOverride(
      options.nativePetStateOverride,
      'XTLAW_BUDDY_PET_STATE_PATH',
      path,
    ) ?? joinPath(runtimeDirectories.stateRoot, 'pet-state.json')
    : null
  const userData = resolveAbsoluteOverride(
    options.userDataOverride,
    'Electron userData',
    path,
  ) ?? runtimeDirectories.userData
  const buddyHome = joinPath(lexoraHome, 'buddy')
  const configPath = joinPath(lexoraHome, 'config.toml')

  // Guard known Lexora roots even for explicit overrides. This is not an
  // import/migration path and must never silently reopen the original app's data.
  const canonicalLegacy = (value: string) => canonicalTestPath(value, path, platform.id === process.platform)
  const legacyRoots = (['stable', 'development'] as const).flatMap((profile) => {
    const legacyIdentity = {
      ...identity,
      appName: profile === 'stable' ? 'Lexora Buddy' : 'Lexora Buddy Dev',
      namespace: profile === 'stable' ? 'lexora-buddy' : 'lexora-buddy-dev',
      profile,
    }
    const home = joinPath(options.userHome, profile === 'stable' ? '.lexora' : '.lexora-dev')
    return [options, { ...options, xdgCacheHome: undefined, xdgConfigHome: undefined, xdgStateHome: undefined }].flatMap((directoryOptions) => {
      const directories = layout.resolveDirectories(legacyIdentity, home, {
        ...directoryOptions,
        defaultUserData: joinPath(path.dirname(options.defaultUserData), 'Lexora Buddy'),
      })
      const sockets = platform.id === 'win32' ? [] : [directories.nativePetSocket, directories.browserAdapterSocket]
      const windowsRuntimeRoot = platform.id === 'win32' ? [path.dirname(directories.stateRoot)] : []
      return [home, directories.userData, directories.sessionData, directories.stateRoot, ...windowsRuntimeRoot, ...sockets].filter(value => value !== null).map(canonicalLegacy)
    })
  })
  const writablePaths = [lexoraHome, userData, runtimeDirectories.sessionData, runtimeDirectories.stateRoot, nativePetState, ...(platform.id === 'win32' ? [] : [nativePetSocket, runtimeDirectories.browserAdapterSocket])].filter(value => value !== null)
  for (const candidate of writablePaths) {
    const target = canonicalLegacy(candidate)
    if (legacyRoots.some(root => containsPath(root, target, path) || containsPath(target, root, path)))
      throw new Error('XTLaw paths must not overlap Lexora data or runtime directories')
  }

  if (identity.profile === 'test') {
    const canonical = (value: string) => canonicalTestPath(value, path, platform.id === process.platform)
    const statePaths = [buddyHome, configPath, userData, runtimeDirectories.sessionData, runtimeDirectories.stateRoot, nativePetState].filter(value => value !== null)
    const socketPaths = platform.id === 'win32' ? [] : [nativePetSocket, runtimeDirectories.browserAdapterSocket].filter(value => value !== null)
    const protectedRoots = (['stable', 'development'] as const).flatMap((profile) => {
      const protectedIdentity = resolveBuddyRuntimeIdentity({ ...options, smokeTest: false, profileOverride: profile })
      const home = joinPath(options.userHome, profile === 'stable' ? '.xtlaw' : '.xtlaw-dev')
      return [options, { ...options, xdgCacheHome: undefined, xdgConfigHome: undefined, xdgStateHome: undefined }].flatMap((directoryOptions) => {
        const directories = layout.resolveDirectories(protectedIdentity, home, directoryOptions)
        const sockets = platform.id === 'win32' ? [] : [directories.nativePetSocket, directories.browserAdapterSocket]
        return [home, directories.userData, directories.sessionData, directories.stateRoot, ...sockets].filter(value => value !== null).map(canonical)
      })
    })
    for (const candidate of [lexoraHome, ...statePaths, ...socketPaths]) {
      const target = canonical(candidate)
      if (protectedRoots.some(root => containsPath(root, target, path) || containsPath(target, root, path)))
        throw new Error('Test profile paths must not overlap stable or development data')
    }
    for (const candidate of statePaths) {
      if (!containsPath(canonical(lexoraHome), canonical(candidate), path))
        throw new Error('Test profile state must stay inside XTLAW_HOME')
    }
  }

  return {
    ...identity,
    agentDirectory: joinPath(buddyHome, 'agent'),
    browserAdapterSocket: runtimeDirectories.browserAdapterSocket,
    buddyHome,
    configPath,
    crashDumps: joinPath(runtimeDirectories.stateRoot, 'crashes'),
    lexoraHome,
    logs: joinPath(runtimeDirectories.stateRoot, 'logs'),
    nativePetSocket,
    nativePetState,
    sessionData: runtimeDirectories.sessionData,
    userData,
    windowState: joinPath(runtimeDirectories.stateRoot, 'window-state.json'),
  }
}

function resolveBuddyRuntimeIdentity(
  options: BuddyRuntimePathOptions,
): BuddyRuntimeIdentity {
  const profile = resolveBuddyRuntimeProfile(options)
  if (profile === 'stable') {
    return {
      appName: 'XTLaw',
      desktopName: options.desktopName,
      namespace: 'xtlaw',
      profile,
    }
  }
  if (profile === 'development') {
    return {
      appName: 'XTLaw Dev',
      desktopName: `${options.desktopName}.Development`,
      namespace: 'xtlaw-dev',
      profile,
    }
  }
  return {
    appName: 'XTLaw Test',
    desktopName: `${options.desktopName}.Test`,
    namespace: 'xtlaw-test',
    profile,
  }
}

function resolveBuddyRuntimeProfile(
  options: BuddyRuntimePathOptions,
): BuddyRuntimeProfile {
  if (options.smokeTest) {
    if (options.profileOverride && options.profileOverride !== 'test')
      throw new Error('Smoke verification requires the test profile')
    return 'test'
  }
  if (options.profileOverride === undefined)
    return options.isPackaged ? 'stable' : 'development'
  if (!BUDDY_RUNTIME_PROFILES.includes(options.profileOverride as BuddyRuntimeProfile))
    throw new Error('XTLAW_BUDDY_PROFILE must be stable, development, or test')
  return options.profileOverride as BuddyRuntimeProfile
}

function containsPath(root: string, candidate: string, path: PlatformPath): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}

function canonicalTestPath(value: string, path: PlatformPath, nativePlatform: boolean): string {
  if (!nativePlatform)
    return value
  try {
    return realpathSync.native(value)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
    if (lstatSync(value, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error('Test profile paths must not use dangling symbolic links')
    const parent = path.dirname(value)
    if (parent === value)
      throw error
    return path.join(canonicalTestPath(parent, path, true), path.basename(value))
  }
}

function resolveLexoraHome(
  profile: BuddyRuntimeProfile,
  options: BuddyRuntimePathOptions,
  path: PlatformPath,
): string {
  const override = resolveAbsoluteOverride(options.lexoraHomeOverride, 'XTLAW_HOME', path)
  if (override)
    return override
  if (profile === 'test')
    throw new Error('XTLAW_HOME is required for the test profile')
  return path.join(options.userHome, profile === 'stable' ? '.xtlaw' : '.xtlaw-dev')
}

function resolveAbsoluteOverride(value: string | undefined, name: string, path: PlatformPath): string | undefined {
  if (value === undefined || value === '')
    return undefined
  return requireAbsolutePath(value, name, path)
}

function requireAbsolutePath(value: string, name: string, path: PlatformPath): string {
  if (!path.isAbsolute(value))
    throw new Error(`${name} must be an absolute path`)
  return path.normalize(value)
}
