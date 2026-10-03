import type { BrowserWindow } from 'electron'
import type { ArtifactOpenRequest, ArtifactOpenResult } from '../../../shared/artifacts/artifactApi'
import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { dialog, shell } from 'electron'

interface ExternalEntry { path: string, kind: 'file' | 'directory' }

// Arguments are passed separately, never through a command shell.
function launchApplication(program: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { detached: true, stdio: 'ignore', shell: false })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

async function chooseApplication(path: string, window: BrowserWindow | null): Promise<ArtifactOpenResult> {
  if (process.platform === 'win32') {
    await launchApplication(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'rundll32.exe'), ['shell32.dll,OpenAs_RunDLL', path])
    return { status: 'chooser-shown' }
  }
  const options = {
    properties: ['openFile'] as const,
    defaultPath: process.platform === 'darwin' ? '/Applications' : '/usr/bin',
    ...(process.platform === 'darwin' ? { filters: [{ name: 'Applications', extensions: ['app'] }] } : {}),
  }
  const selection = window ? await dialog.showOpenDialog(window, { ...options, properties: ['openFile'] }) : await dialog.showOpenDialog({ ...options, properties: ['openFile'] })
  const application = selection.filePaths[0]
  if (selection.canceled || !application)
    return { status: 'cancelled' }
  if (process.platform === 'darwin') {
    await launchApplication('/usr/bin/open', ['-a', application, path])
  }
  else {
    if (!(await stat(application)).isFile())
      throw new Error('Selected application must be an executable file')
    await access(application, constants.X_OK)
    await launchApplication(application, [path])
  }
  return { status: 'opened' }
}

export async function openArtifactEntry(entry: ExternalEntry, action: ArtifactOpenRequest['action'], window: BrowserWindow | null): Promise<ArtifactOpenResult> {
  // Check again in the host process before invoking the operating system.
  const metadata = await stat(entry.path)
  if ((entry.kind === 'file' && !metadata.isFile()) || (entry.kind === 'directory' && !metadata.isDirectory()))
    throw new Error('Artifact type changed')
  if (action === 'choose-app') {
    if (entry.kind !== 'file')
      throw new Error('Only files support choosing an application')
    return chooseApplication(entry.path, window)
  }
  if (action === 'reveal' && entry.kind === 'file') {
    shell.showItemInFolder(entry.path)
    return { status: 'opened' }
  }
  const error = await shell.openPath(entry.path)
  if (!error)
    return { status: 'opened' }
  // An existing, authorized file may lack an association. Offer a user-selected
  // alternative without claiming every openPath failure means no default app.
  if (action === 'open' && entry.kind === 'file')
    return { status: 'choose-app' }
  throw new Error(error)
}
