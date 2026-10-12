import type { LocalChatIpcContext } from './registrar'
import type { IpcMainInvokeEvent } from 'electron'
import { nativeImage } from 'electron'
import { buddiesRpc, legacyBuddyProfileRpc } from '../../../shared/buddies/buddyApi'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'
import { getSystemUserProfile } from '../platform/systemProfile'

export function registerBuddiesIpc({ handle: register, request, options }: LocalChatIpcContext): void {
  let migration: Promise<void> | undefined
  const prepare = () => migration ??= (options.configStore?.migrateAgentProfile(async (profile) => {
    let avatar: string | null = null
    if (profile.avatar) {
      const image = nativeImage.createFromDataURL(profile.avatar)
      if (image.isEmpty())
        throw new Error('LEGACY_AGENT_AVATAR_INVALID')
      avatar = image.resize({ width: 256, height: 256 }).toDataURL()
    }
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
