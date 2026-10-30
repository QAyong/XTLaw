import type { ArtifactRecord } from '../storage/artifactRepository'
import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import type { ConversationDirectoryGrantRepository } from '../storage/conversationDirectoryGrantRepository'
import type { ConversationRepository } from '../storage/conversationRepository'
import type { SpaceRepository } from '../storage/spaceRepository'
import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { resolveGrantedPath } from '../directories/resolveGrantedPath'
import { createSensitivePathMatcher } from '../permissions/sensitivePaths'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { requireActiveSpace } from '../spaces/requireActiveSpace'

interface ArtifactFileAccessOptions {
  conversations: Pick<ConversationRepository, 'findById'>
  conversationGrants: Pick<ConversationDirectoryGrantRepository, 'listActive'>
  spaces: Pick<SpaceRepository, 'findById'>
  paths: BuddyDataPaths
}

export class ArtifactFileAccess {
  readonly #options: ArtifactFileAccessOptions

  constructor(options: ArtifactFileAccessOptions) {
    this.#options = options
  }

  async resolve(artifact: ArtifactRecord): Promise<{ root: string, path: string }> {
    const grant = await this.grant(artifact)
    if (grant.canonicalRoot !== artifact.directoryRoot || await realpath(grant.root) !== grant.canonicalRoot)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const requestedPath = resolve(grant.canonicalRoot, artifact.relativePath)
    const result = await resolveGrantedPath([{ ...grant, grantId: artifact.directoryGrantId, kind: 'workspace' }], requestedPath, 'existing')
    const sensitive = createSensitivePathMatcher()
    if (result.canonicalPath !== artifact.currentPath || sensitive.matches(grant.root)
      || sensitive.matches(requestedPath) || sensitive.matches(result.canonicalPath)
      || JSON.stringify(await this.grant(artifact)) !== JSON.stringify(grant)) {
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    }
    return { root: grant.canonicalRoot, path: result.canonicalPath }
  }

  // An output written under a one-run grant has no stored grant to check. It is trusted at the directory it recorded, as long as that
  // directory and file are still the ones that were recorded and nothing sensitive is involved.
  async resolveRecordedRoot(artifact: ArtifactRecord): Promise<{ root: string, path: string }> {
    const conversation = this.#options.conversations.findById(artifact.conversationId)
    if (!artifact.directoryGrantId.startsWith('run:') || !conversation || conversation.deletedAt !== null)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const [root, path] = await Promise.all([realpath(artifact.directoryRoot), realpath(artifact.currentPath)]).catch(() => {
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    })
    const sensitive = createSensitivePathMatcher()
    const offset = relative(root, path)
    if (root !== artifact.directoryRoot || path !== artifact.currentPath || offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)
      || sensitive.matches(root) || sensitive.matches(path)) {
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    }
    return { root, path }
  }

  private async grant(artifact: ArtifactRecord): Promise<{ root: string, canonicalRoot: string, revision?: number }> {
    const { conversations, conversationGrants, spaces, paths } = this.#options
    const conversation = conversations.findById(artifact.conversationId)
    if (!conversation || conversation.deletedAt !== null)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const space = conversation.spaceId ? requireActiveSpace(spaces.findById(conversation.spaceId)) : null
    const grants = [
      ...(space ? [space.primaryDirectory, ...space.additionalDirectories] : []),
      ...conversationGrants.listActive(conversation.id),
    ]
    const grant = grants.find(grant => grant?.id === artifact.directoryGrantId && !grant.revokedAt)
    if (grant)
      return { root: grant.root, canonicalRoot: grant.canonicalRoot, ...('revision' in grant ? { revision: grant.revision } : {}) }
    const ownedRoot = artifact.directoryGrantId === conversation.id
      ? paths.conversationWorkspace(conversation.id)
      : space && artifact.directoryGrantId === space.id ? paths.spaceWorkspace(space.id) : null
    if (!ownedRoot)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    return { root: ownedRoot, canonicalRoot: await realpath(ownedRoot) }
  }
}
