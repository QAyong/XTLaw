import type { LocalAttachment } from '@buddy-shared/conversation/attachmentApi'
import type { BuddyLocalResource } from '@buddy-shared/conversation/localResource'
import { taskFileMediaUrl } from '@buddy-shared/files/mediaPreview'
import { describe, expect, it } from 'vitest'
import { resolveBuddyAttachmentPreviewUrl, resolveMessageResourcePreviewUrl } from '../chatAttachmentView'

const photo: BuddyLocalResource = { kind: 'file', mimeType: 'image/jpeg', name: 'summer #1.jpg', path: '/photos/summer #1.jpg', sizeBytes: 2000 }
const windowsPhoto: BuddyLocalResource = { kind: 'file', mimeType: 'image/png', name: 'shot.png', path: 'D:\\workspace\\shot.png', sizeBytes: 4 }

function attachment(overrides: Partial<LocalAttachment> = {}): LocalAttachment {
  return { attachmentId: 'upload-1', kind: 'image', mimeType: 'image/png', name: 'scan.png', previewUrl: null, sizeBytes: 100, ...overrides }
}

describe('resolveMessageResourcePreviewUrl', () => {
  it('uses the authorized task media URL for a real workspace image reference', () => {
    for (const [resource, conversationId] of [[photo, 'task'], [windowsPhoto, 'task windows']] as const) {
      const previewUrl = resolveMessageResourcePreviewUrl(resource, conversationId)
      const url = new URL(previewUrl!)
      expect(previewUrl).toBe(taskFileMediaUrl({ conversationId, path: resource.path }))
      expect(url.protocol).toBe('lexora-file:')
      expect(url.hostname).toBe('task-media')
      expect(url.pathname).toBe('/')
      expect(url.username).toBe('')
      expect(url.password).toBe('')
      expect([...url.searchParams.keys()].sort()).toEqual(['conversationId', 'path'])
      expect(url.searchParams.get('conversationId')).toBe(conversationId)
      expect(url.searchParams.get('path')).toBe(resource.path)
      expect(previewUrl!.startsWith('file:')).toBe(false)
    }
  })

  it('leaves ordinary files, directories, missing paths and non-images without a preview URL', () => {
    const cases: BuddyLocalResource[] = [
      { kind: 'file', mimeType: 'text/plain', name: 'notes.txt', path: '/photos/notes.txt', sizeBytes: 20 },
      { kind: 'file', mimeType: 'application/pdf', name: 'brief.pdf', path: '/photos/brief.pdf', sizeBytes: 20 },
      { kind: 'file', mimeType: 'image/tiff', name: 'scan.tif', path: '/photos/scan.tif', sizeBytes: 20 },
      { kind: 'file', mimeType: 'image/png', name: 'relative.png', path: 'photos/relative.png', sizeBytes: 20 },
      { kind: 'directory', mimeType: 'image/png', name: 'album', path: '/photos', sizeBytes: 0 },
      { kind: 'directory', mimeType: 'inode/directory', name: 'album', path: '/photos', sizeBytes: 0 },
    ]
    for (const resource of cases)
      expect(resolveMessageResourcePreviewUrl(resource, 'task')).toBeNull()
    expect(resolveMessageResourcePreviewUrl(photo, ' ')).toBeNull()
  })

  it('keeps uploaded attachments on the attachment preview and does not retarget them', () => {
    expect(resolveMessageResourcePreviewUrl(attachment(), 'task')).toBe('lexora-attachment://preview/upload-1')
    expect(resolveMessageResourcePreviewUrl(attachment({ previewUrl: 'lexora-attachment://preview/explicit' }), 'task')).toBe('lexora-attachment://preview/explicit')
    expect(resolveMessageResourcePreviewUrl(attachment({ kind: 'text', mimeType: 'text/plain', name: 'notes.txt' }), 'task')).toBeNull()
    expect(resolveMessageResourcePreviewUrl(attachment(), 'task')).toBe(resolveBuddyAttachmentPreviewUrl(attachment()))
  })
})
