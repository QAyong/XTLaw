import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveNativePetControlSocketPath } from '../nativePetControlSocket'

describe('nativePetControlSocket', () => {
  it('uses the XTLaw socket path under the session directory', () => {
    expect(resolveNativePetControlSocketPath({
      env: { XDG_RUNTIME_DIR: '/run/user/1000' },
      temporaryDirectory: '/tmp',
      userId: 1000,
    })).toBe(join('/run/user/1000', 'xtlaw', 'native-pet.sock'))
  })
})
