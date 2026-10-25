import { randomUUID } from 'node:crypto'
import { parse, stringify } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { mergeSettings } from '../backupSettings'

describe('backup settings notification sounds', () => {
  it('merges custom sound lists with the restored selection while old backups preserve current sounds', () => {
    const existing = { id: randomUUID(), name: 'Current', mimeType: 'audio/wav', durationMs: 800 }
    const imported = { id: randomUUID(), name: 'Imported', mimeType: 'audio/mpeg', durationMs: 500 }
    const current = stringify({ desktop: { notification_sound: { selected: existing.id, volume: 0.4, sounds: [existing] } } })
    const incoming = stringify({ desktop: { notification_sound: { selected: imported.id, volume: 0.9, sounds: [imported] } } })
    expect(parse(mergeSettings(current, incoming))).toMatchObject({ desktop: { notification_sound: { selected: imported.id, volume: 0.9, sounds: [existing, imported] } } })
    expect(parse(mergeSettings(current, '[desktop]\nlanguage="en-US"'))).toMatchObject({ desktop: { notification_sound: { selected: existing.id, volume: 0.4, sounds: [existing] } } })
  })
})
