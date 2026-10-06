import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { describe, expect, it } from 'vitest'
import {
  resolveLinuxConfigDirectory,
  syncLinuxAutostart,
} from '../linuxAutostart'

describe('linuxAutostart', () => {
  it('uses an absolute XDG config directory and rejects relative overrides', () => {
    expect(resolveLinuxConfigDirectory('/home/lexora', '/var/lib/lexora-config'))
      .toBe('/var/lib/lexora-config')
    expect(resolveLinuxConfigDirectory('/home/lexora', 'relative/config'))
      .toBe('/home/lexora/.config')
  })

  it('writes and removes the XTLaw background autostart entry', async () => {
    const configDirectory = await createTemporaryDirectory('lexora-autostart-test-')
    const entryPath = join(configDirectory, 'autostart', 'io.github.qayong.XTLaw.desktop')

    await syncLinuxAutostart({
      configDirectory,
      enabled: true,
      executablePath: '/opt/XTLaw/lexora-buddy',
    })

    expect(await readFile(entryPath, 'utf8')).toBe([
      '[Desktop Entry]',
      'Type=Application',
      'Version=1.0',
      'Name=XTLaw',
      'TryExec=/opt/XTLaw/lexora-buddy',
      'Exec="/opt/XTLaw/lexora-buddy" --background',
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n'))

    await syncLinuxAutostart({
      configDirectory,
      enabled: false,
      executablePath: '/opt/XTLaw/lexora-buddy',
    })

    await expect(readFile(entryPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
