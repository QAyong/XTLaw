import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

async function start() {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const runs = path.join(root, '.playwright/runs')
  await mkdir(runs, { recursive: true })
  const run = await mkdtemp(path.join(runs, 'office-dev-'))
  const home = await mkdtemp(path.join(tmpdir(), 'lexora-office-dev-'))
  await writeFile(path.join(home, 'config.toml'), '[desktop]\nlanguage="zh-CN"\nnotifications_enabled=false\nlaunch_at_login=false\n[pet]\nenabled=false\n[proxy]\nmode="direct"\nserver=""\n')
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && !/^(?:LEXORA_|ELECTRON_|PI_)/.test(key)))
  const args = ['--filter', '@uselexora/lexora-buddy', 'dev', '--remoteDebuggingPort', '9237', '--watch']
  const child = spawn(process.platform === 'win32' ? 'cmd.exe' : 'pnpm', process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm', ...args] : args, {
    cwd: root,
    env: { ...environment, LEXORA_HOME: home, LEXORA_BUDDY_PROFILE: 'test', LEXORA_EXTENSION_DEVELOPMENT_PATH: path.join(root, 'plugins/office') },
    stdio: 'inherit',
  })
  await writeFile(path.join(run, 'launch.json'), `${JSON.stringify({ run, home, pid: child.pid, supervisorPid: process.pid, cdpPort: 9237, plugin: path.join(root, 'plugins/office'), mode: 'pnpm dev, isolated test profile' }, null, 2)}\n`)
  process.stdout.write(`Office development preview: ${run}\n`)
  child.on('error', (error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
  child.on('exit', (code) => { process.exitCode = code ?? 1 })
}
void start().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
