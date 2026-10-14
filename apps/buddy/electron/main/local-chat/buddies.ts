import type { IpcMainInvokeEvent } from 'electron'
import type { LocalChatIpcContext } from './registrar'
import { nativeImage } from 'electron'
import { buddiesRpc, legacyBuddyProfileRpc } from '../../../shared/buddies/buddyApi'
import { safeDiagnosticReporter } from '../../../shared/diagnostics/applicationDiagnostic'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'
import { getSystemUserProfile } from '../platform/systemProfile'

export function registerBuddiesIpc({ handle: register, request, options }: LocalChatIpcContext): void {
  let migration: Promise<void> | undefined
  const record = safeDiagnosticReporter(options.recordDiagnostic)
  const prepare = () => migration ??= (options.configStore?.migrateAgentProfile(async (profile) => {
    const avatar = profile.avatar ? convertLegacyAvatar(profile.avatar) : null
    // The legacy picker accepted any image type, but Electron only decodes PNG and JPEG. Keep the
    // name and fall back to the default avatar, otherwise every buddy request would keep failing.
    if (profile.avatar && !avatar)
      record({ event: 'buddy.legacy_avatar.dropped', component: 'desktop.buddies', level: 'warn', errorCode: 'LEGACY_AGENT_AVATAR_INVALID' })
    await request(legacyBuddyProfileRpc, { name: profile.name, avatar })
  }, getSystemUserProfile) ?? Promise.resolve()).catch((error) => {
    migration = undefined
    throw error
  })
  const handle = <T>(channel: string, handler: (event: IpcMainInvokeEvent, input: T) => unknown) => register<T>(channel, async (event, input) => {
    await prepare()
    return handler(event, input)
  })
  handle(LOCAL_CHAT_IPC_CHANNELS.buddiesToolOptions, () => request(buddiesRpc.toolOptions, {}))
  handle(LOCAL_CHAT_IPC_CHANNELS.buddiesList, () => request(buddiesRpc.list, {}))
  handle(LOCAL_CHAT_IPC_CHANNELS.buddiesGet, (_event, input) => request(buddiesRpc.get, buddiesRpc.get.input.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.buddiesCreate, (_event, input) => request(buddiesRpc.create, buddiesRpc.create.input.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.buddiesDelete, (_event, input) => request(buddiesRpc.delete, buddiesRpc.delete.input.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.buddiesResetProfile, (_event, input) => request(buddiesRpc.resetProfile, buddiesRpc.resetProfile.input.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.buddiesSetDefault, (_event, input) => request(buddiesRpc.setDefault, buddiesRpc.setDefault.input.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.buddiesUpdate, (_event, input) => request(buddiesRpc.update, buddiesRpc.update.input.parse(input)))
}

function convertLegacyAvatar(dataUrl: string): string | null {
  try {
    const image = nativeImage.createFromDataURL(dataUrl)
    return image.isEmpty() ? null : image.resize({ width: 256, height: 256 }).toDataURL()
  }
  catch {
    return null
  }
}
