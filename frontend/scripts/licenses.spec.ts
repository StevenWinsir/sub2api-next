import { describe, expect, it } from 'vitest'
import { findViolations, isAllowedLicense } from './lib/licenses.mjs'

describe('license policy', () => {
  it('allows permissive licenses and SPDX expressions where every AND / any OR branch is allowed', () => {
    for (const l of [
      'MIT',
      'ISC',
      'Apache-2.0',
      '0BSD',
      '(MPL-2.0 OR Apache-2.0)',
      'MIT AND ISC AND BSD-3-Clause'
    ])
      expect(isAllowedLicense(l), l).toBe(true)
  })
  it('rejects copyleft and unknown licenses', () => {
    for (const l of [
      'GPL-3.0-only',
      'AGPL-3.0',
      'LGPL-3.0-or-later',
      'SSPL-1.0',
      '',
      'UNLICENSED',
      'MIT AND GPL-2.0-only'
    ])
      expect(isAllowedLicense(l), l).toBe(false)
  })
  it('only the registered exceptions may carry a non-allowed license', () => {
    expect(
      findViolations({
        MIT: [{ name: 'react' }],
        'LGPL-3.0-or-later': [{ name: '@img/sharp-libvips-linux-x64' }],
        'CC-BY-4.0': [{ name: 'caniuse-lite' }],
        'OFL-1.1': [{ name: '@fontsource-variable/inter' }]
      })
    ).toEqual([])
    expect(
      findViolations({
        'GPL-3.0-only': [{ name: 'evil-lib' }],
        'LGPL-3.0-or-later': [{ name: 'other-lgpl' }]
      })
    ).toEqual([
      { name: 'evil-lib', license: 'GPL-3.0-only' },
      { name: 'other-lgpl', license: 'LGPL-3.0-or-later' }
    ])
  })
})
