import { describe, expect, it } from 'vitest'
import { fileChangeAffects, fileChangeKey, fileTargetKey, fileTargetSchema, grantFileTargetSchema, isGrantFileTarget, readFileTarget, requireFileTarget, sameFileDirectory, sameFileRoot, sameFileTarget, spaceFileTargetOnly, spaceFilesChanged, spaceFileMutationSchema } from '../spaceFileApi'

const space = { spaceId: 'space-1', directoryId: 'directory-1', revision: 2, path: 'src/a.ts' }
const grant = { conversationId: 'conversation-1', root: '/work/out', path: 'report.docx' }

describe('file targets', () => {
  it('accepts a space file or a granted directory file and rejects mixtures', () => {
    expect(fileTargetSchema.parse(space)).toEqual(space)
    expect(fileTargetSchema.parse(grant)).toEqual(grant)
    expect(fileTargetSchema.safeParse({ ...space, ...grant }).success).toBe(false)
    expect(fileTargetSchema.safeParse({ conversationId: 'conversation-1', root: 'relative/dir', path: '' }).success).toBe(false)
    expect(grantFileTargetSchema.safeParse({ ...grant, extra: true }).success).toBe(false)
    expect(isGrantFileTarget(grant)).toBe(true)
    expect(isGrantFileTarget(space)).toBe(false)
  })

  it('keeps the space resource id unchanged so saved layouts still match', () => {
    expect(fileTargetKey(space)).toBe(JSON.stringify(['directory-1', 2, 'src/a.ts']))
    expect(fileTargetKey(grant)).toBe(JSON.stringify(['conversation-1', '/work/out', 'report.docx']))
  })

  it('reads a target out of resource data that carries other fields', () => {
    expect(readFileTarget({ ...space, canonicalRoot: '/x' })).toEqual(space)
    expect(readFileTarget({ ...grant, canonicalRoot: '/work/out' })).toEqual(grant)
    expect(readFileTarget({ path: 'a' })).toBeNull()
    expect(readFileTarget(undefined)).toBeNull()
    expect(() => requireFileTarget({})).toThrow('FILE_TARGET_INVALID')
  })

  it('compares roots, directories and targets without mixing the two kinds', () => {
    expect(sameFileRoot(space, { ...space, path: 'other' })).toBe(true)
    expect(sameFileRoot(space, { ...space, revision: 3 })).toBe(false)
    expect(sameFileDirectory(space, { ...space, revision: 3 })).toBe(true)
    expect(sameFileRoot(grant, { ...grant, path: '' })).toBe(true)
    expect(sameFileRoot(grant, { ...grant, root: '/work/other' })).toBe(false)
    expect(sameFileRoot(grant, { ...grant, conversationId: 'conversation-2' })).toBe(false)
    expect(sameFileRoot(space, grant)).toBe(false)
    expect(sameFileDirectory(grant, space)).toBe(false)
    expect(sameFileTarget(grant, { ...grant })).toBe(true)
    expect(sameFileTarget(grant, { ...grant, path: 'x' })).toBe(false)
  })

  it('hides granted targets from plugin-facing code until plugins accept them', () => {
    expect(spaceFileTargetOnly(space)).toBe(space)
    expect(spaceFileTargetOnly(grant)).toBeUndefined()
  })

  it('matches change notices to the root they happened in', () => {
    const spaceChange = spaceFilesChanged.params.parse({ spaceId: 'space-1', directoryId: 'directory-1', directoryRevision: 2, revision: 1, operationId: 'op', kind: 'saved' })
    const grantChange = spaceFilesChanged.params.parse({ conversationId: 'conversation-1', root: '/work/out', revision: 2, operationId: 'op', kind: 'changed' })
    expect(fileChangeAffects(spaceChange, space)).toBe(true)
    expect(fileChangeAffects(spaceChange, { ...space, revision: 1 })).toBe(false)
    expect(fileChangeAffects(spaceChange, grant)).toBe(false)
    expect(fileChangeAffects(grantChange, grant)).toBe(true)
    expect(fileChangeAffects(grantChange, { ...grant, root: '/work/other' })).toBe(false)
    expect(fileChangeAffects(grantChange, space)).toBe(false)
    expect(fileChangeKey(spaceChange)).toBe('directory-1:2')
    expect(fileChangeKey(grantChange)).toBe('conversation-1:/work/out')
    expect(spaceFilesChanged.params.safeParse({ ...grantChange, spaceId: 'space-1' }).success).toBe(false)
  })

  it('lets a granted directory request every file action, with the destination as a target too', () => {
    const operationId = crypto.randomUUID()
    expect(spaceFileMutationSchema.parse({ ...grant, operationId, action: { kind: 'copy', destination: { ...grant, path: 'copy.docx' } } })).toMatchObject({ conversationId: 'conversation-1' })
    expect(spaceFileMutationSchema.parse({ ...space, operationId, action: { kind: 'move', destination: grant } })).toMatchObject({ spaceId: 'space-1' })
    expect(spaceFileMutationSchema.safeParse({ ...grant, operationId, action: { kind: 'copy', destination: { path: 'x' } } }).success).toBe(false)
  })
})
