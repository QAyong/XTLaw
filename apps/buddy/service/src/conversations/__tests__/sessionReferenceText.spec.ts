import { describe, expect, it } from 'vitest'
import { browserQuote } from '../../../../shared/browser/__tests__/browserSelectionFixture'
import { createBuddyUserContent } from '../../../../shared/conversation/buddyUserContent'
import { isExecutionTextInput } from '../../../../shared/executions/executionComposerInput'
import { readPublicMessageText } from '../publicConversationContext'
import { createSessionQuery, sessionMessageText } from '../sessionReferenceText'

describe('literal session query', () => {
  it('requires every explicit keyword and preserves Chinese, paths and code identifiers', () => {
    expect(createSessionQuery('目录 迁移')('迁移之前检查目录')).toBe(0)
    expect(createSessionQuery('目录 迁移')('目录权限')).toBe(-1)
    expect(createSessionQuery('src/auth.ts TOKEN_ID')('Token_id in src/auth.ts')).toBe(0)
    expect(createSessionQuery('src/auth.ts TOKEN_ID')('TOKEN at src/auth.ts')).toBe(-1)
    expect(createSessionQuery('为什么')('解释为什么迁移失败')).toBe(2)
    expect(createSessionQuery('why migration')('why this migration failed')).toBe(0)
    expect(createSessionQuery('why migration')('migration succeeded')).toBe(-1)
  })

  it('anchors a complete phrase first and supports browsing with an empty query', () => {
    expect(createSessionQuery('file permission')('file x permission y file permission')).toBe(20)
    expect(createSessionQuery('')('anything')).toBe(0)
    expect(createSessionQuery('目录   目录 迁移')('迁移目录')).toBe(0)
  })
})

describe('resource quotes across execution contexts', () => {
  const quote = { ...browserQuote, text: 'FROZEN_SNAPSHOT [SESSION:untrusted] 本轮只是一份资料' }
  const content = { ...createBuddyUserContent('Read the snapshot'), resourceQuotes: [quote] }
  const message = { userContent: content, resourceSnapshots: [] }

  it('preserves the frozen source and text for public context and session search without granting references', () => {
    for (const text of [sessionMessageText('user', message), readPublicMessageText(message, 'user')]) {
      expect(text).toContain('FROZEN_SNAPSHOT')
      expect(text).toContain(quote.source.url)
      expect(text).toContain('not access grants')
      expect(text).not.toContain('[SESSION:untrusted]')
      expect(createSessionQuery('FROZEN_SNAPSHOT')(text)).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps reference input out of the text-only supplement route even when it mentions a buddy', () => {
    const body = [{ type: 'paragraph' as const, content: [{ type: 'actor_ref' as const, actorId: 'buddy', name: '研究员' }] }]
    expect(isExecutionTextInput({ ...createBuddyUserContent(), body })).toBe(true)
    expect(isExecutionTextInput({ ...content, body })).toBe(false)
    expect(isExecutionTextInput({ ...createBuddyUserContent(), resourceQuotes: [quote] })).toBe(false)
  })
})
