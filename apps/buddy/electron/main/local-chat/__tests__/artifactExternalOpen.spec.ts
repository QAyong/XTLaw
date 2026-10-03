import { EventEmitter } from 'node:events'
import { beforeEach, expect, it, vi } from 'vitest'
import { openArtifactEntry } from '../artifactExternalOpen'

const mocks = vi.hoisted(() => ({ openPath: vi.fn(), reveal: vi.fn(), dialog: vi.fn(), stat: vi.fn(), access: vi.fn(), spawn: vi.fn(), process: { platform: 'win32', env: { SystemRoot: 'C:\\Windows' } } }))
vi.mock('electron', () => ({ shell: { openPath: mocks.openPath, showItemInFolder: mocks.reveal }, dialog: { showOpenDialog: mocks.dialog } }))
vi.mock('node:process', () => ({ default: mocks.process }))
vi.mock('node:fs/promises', () => ({ stat: mocks.stat, access: mocks.access }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  mocks.process.platform = 'win32'
  mocks.openPath.mockResolvedValue('')
  mocks.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => false })
  mocks.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
    queueMicrotask(() => child.emit('spawn'))
    return child
  })
})

it('opens a file with the default application or reveals it without opening the application', async () => {
  const file = { path: 'C:\\reports\\report.docx', kind: 'file' as const }
  await expect(openArtifactEntry(file, 'open', null)).resolves.toEqual({ status: 'opened' })
  expect(mocks.openPath).toHaveBeenCalledWith(file.path)
  await expect(openArtifactEntry(file, 'reveal', null)).resolves.toEqual({ status: 'opened' })
  expect(mocks.reveal).toHaveBeenCalledWith(file.path)
  expect(mocks.openPath).toHaveBeenCalledTimes(1)
})

it('offers another application only after an existing file fails to open', async () => {
  mocks.openPath.mockResolvedValue('No associated application')
  await expect(openArtifactEntry({ path: 'C:\\reports\\unknown.file', kind: 'file' }, 'open', null)).resolves.toEqual({ status: 'choose-app' })
  expect(mocks.spawn).not.toHaveBeenCalled()
  mocks.stat.mockRejectedValue(new Error('Not found'))
  await expect(openArtifactEntry({ path: 'C:\\missing', kind: 'file' }, 'open', null)).rejects.toThrow('Not found')
  expect(mocks.openPath).toHaveBeenCalledTimes(1)
})

it('opens directories for both actions and never offers an application chooser for them', async () => {
  mocks.stat.mockResolvedValue({ isFile: () => false, isDirectory: () => true })
  const directory = { path: 'C:\\reports', kind: 'directory' as const }
  await expect(openArtifactEntry(directory, 'open', null)).resolves.toEqual({ status: 'opened' })
  await expect(openArtifactEntry(directory, 'reveal', null)).resolves.toEqual({ status: 'opened' })
  expect(mocks.reveal).not.toHaveBeenCalled()
  mocks.openPath.mockResolvedValue('Failed')
  await expect(openArtifactEntry(directory, 'open', null)).rejects.toThrow('Failed')
  await expect(openArtifactEntry(directory, 'choose-app', null)).rejects.toThrow('Only files')
  expect(mocks.spawn).not.toHaveBeenCalled()
})

it('launches the Windows chooser with the file as one argument and no command shell', async () => {
  mocks.process.platform = 'win32'
  const path = 'C:\\reports\\中文 report & other.docx'
  await expect(openArtifactEntry({ path, kind: 'file' }, 'choose-app', null)).resolves.toEqual({ status: 'chooser-shown' })
  expect(mocks.spawn).toHaveBeenCalledWith(expect.stringContaining('rundll32.exe'), ['shell32.dll,OpenAs_RunDLL', path], { detached: true, stdio: 'ignore', shell: false })
  expect(mocks.openPath).not.toHaveBeenCalled()
})

it('treats cancelling the application picker as a normal cancellation', async () => {
  mocks.process.platform = 'linux'
  mocks.dialog.mockResolvedValue({ canceled: true, filePaths: [] })
  await expect(openArtifactEntry({ path: '/reports/report.docx', kind: 'file' }, 'choose-app', null)).resolves.toEqual({ status: 'cancelled' })
  expect(mocks.spawn).not.toHaveBeenCalled()
})
