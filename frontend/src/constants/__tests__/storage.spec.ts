import { describe, expect, it } from 'vitest'
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '../storage'

/** 附录 B：必须沿用的浏览器存储键，逐一固化，防止误改导致用户升级后掉登录 / 丢偏好。 */
const APPENDIX_B = [
  'auth_token',
  'refresh_token',
  'auth_user',
  'token_expires_at',
  'pending_auth_session',
  'auth_expired',
  'register_data',
  'email_oauth_pending_provider',
  'oauth_aff_code',
  'affiliate_referral_code',
  'sub2api_login_agreement_consent',
  'theme',
  'sub2api_locale',
  'table-page-size',
  'table-page-size-source',
  'account-hidden-columns',
  'account-hidden-columns-version',
  'account-filter-values',
  'account-table-sort',
  'account-auto-refresh',
  'api-key-hidden-columns',
  'api-key-column-settings-version',
  'group-hidden-columns',
  'group-column-settings-version',
  'user-hidden-columns',
  'user-column-settings-version',
  'user-filter-values',
  'subscription-hidden-columns',
  'subscription-user-column-mode',
  'usage-hidden-columns',
  'usage-hidden-columns-version',
  'usage-error-hidden-columns',
  'user-usage-hidden-columns',
  'user-usage-error-hidden-columns',
  'admin-users-usage-sort',
  'channel-status-auto-refresh',
  'ops_monitoring_enabled_cached',
  'payment_enabled_cached',
  'payment.recovery.current',
  'sub2api:ip-geo-cache:v1',
  'chunk_reload_attempted',
  'sub2api:admin:group-duplicate:',
  'sub2api:admin:channel-monitor-duplicate:'
]

describe('storage keys (Appendix B)', () => {
  it('keeps every legacy key verbatim', () => {
    const values = new Set(Object.values(STORAGE_KEYS))
    expect(APPENDIX_B.filter((key) => !values.has(key as never))).toEqual([])
  })
  it('has no duplicate values', () => {
    const values = Object.values(STORAGE_KEYS)
    expect(new Set(values).size).toBe(values.length)
  })
  it('new keys use the sub2api: prefix and never collide with legacy keys', () => {
    expect(STORAGE_KEYS.bootCorrection.startsWith('sub2api:')).toBe(true)
    expect(STORAGE_KEYS.sidebarCollapsed.startsWith('sub2api:')).toBe(true)
    expect(LEGACY_STORAGE_KEYS).not.toContain(STORAGE_KEYS.bootCorrection)
  })
  it('matches the literal keys the ported API / utils layers read', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const { join, resolve } = await import('node:path')
    const root = resolve(__dirname, '../../')
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const f = join(dir, n)
        return statSync(f).isDirectory() ? (n === '__tests__' || n === 'generated' ? [] : walk(f)) : [f]
      })
    const known = new Set(Object.values(STORAGE_KEYS))
    const unknown: string[] = []
    for (const dir of ['api', 'utils']) {
      for (const file of walk(join(root, dir)).filter((f) => f.endsWith('.ts'))) {
        const src = readFileSync(file, 'utf8')
        for (const m of src.matchAll(
          /(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g
        )) {
          if (!known.has(m[1] as never)) unknown.push(`${file.replace(root, '')}: ${m[1]}`)
        }
      }
    }
    expect(unknown).toEqual([])
  })
})
