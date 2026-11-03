import type { SpaceFileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { TaskContextTab } from '@/modules/tasks'
import { describe, expect, it } from 'vitest'
import { readonly } from 'vue'
import { DocumentSelections } from '../DocumentSelections'

const target = (path = 'report.docx'): SpaceFileTarget => ({ spaceId: 'space', directoryId: 'directory', revision: 1, path })
const filesTab = (id: string, value: SpaceFileTarget): TaskContextTab => ({ id, kind: 'files', scope: 'task:conversation', rootName: 'Files', target: value })

describe('documentSelections', () => {
  it('opens a target once and not again when the tab is shown again', () => {
    const selections = new DocumentSelections()
    const selected = target()
    expect(selections.claim('files', selected)).toBe(true)
    expect(selections.claim('files', selected)).toBe(false)
  })

  it('opens a document again when the user selects the same file again', () => {
    const selections = new DocumentSelections()
    expect(selections.claim('files', target())).toBe(true)
    expect(selections.claim('files', target())).toBe(true)
  })

  it('keeps each tab separate', () => {
    const selections = new DocumentSelections()
    const selected = target()
    expect(selections.claim('first', selected)).toBe(true)
    expect(selections.claim('second', selected)).toBe(true)
  })

  it('does not open a restored target when its tab is shown, including after closing the document beside it', () => {
    const selections = new DocumentSelections()
    const restored = target()
    selections.seed([filesTab('files', restored)])
    expect(selections.claim('files', restored)).toBe(false)
    expect(selections.claim('files', target('other.docx'))).toBe(true)
  })

  it('recognizes a restored target through a reactive wrapper', () => {
    const selections = new DocumentSelections()
    const tab = filesTab('files', target())
    selections.seed([tab])
    expect(selections.claim('files', readonly((tab as Extract<TaskContextTab, { kind: 'files' }>).target))).toBe(false)
  })

  it('ignores tabs that are not file managers', () => {
    const selections = new DocumentSelections()
    selections.seed([{ id: 'view', kind: 'view', scope: 'task:conversation', viewId: 'view', label: 'Office' }])
    expect(selections.claim('view', target())).toBe(true)
  })
})
