import { describe, expect, it } from 'vitest'
import { buildKeyConfigFiles, type KeyConfigContext } from '../keyConfigs'

const base: KeyConfigContext = {
  platform: 'anthropic',
  apiKey: 'sk-test',
  baseUrl: 'https://api.example.com',
  activeClientTab: 'claude',
  activeTab: 'unix',
  codexAuthMode: 'api-key',
  codexModelCatalogMode: 'remote',
  codexLocalCatalogToml: '',
  codexCatalogModelSlugs: [],
  codexModelManifestContent: ''
}

describe('buildKeyConfigFiles', () => {
  it('anthropic: env vars and settings.json', () => {
    const files = buildKeyConfigFiles(base)
    expect(files[0].content).toContain('export ANTHROPIC_BASE_URL="https://api.example.com"')
    expect(files[0].content).toContain('export ANTHROPIC_AUTH_TOKEN="sk-test"')
    expect(files[1].path).toBe('~/.claude/settings.json')
    expect(JSON.parse(files[1].content).env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test')
  })

  it('windows shells use their own syntax', () => {
    expect(buildKeyConfigFiles({ ...base, activeTab: 'cmd' })[0].content).toContain(
      'set ANTHROPIC_AUTH_TOKEN=sk-test'
    )
    expect(buildKeyConfigFiles({ ...base, activeTab: 'powershell' })[0].content).toContain(
      '$env:ANTHROPIC_AUTH_TOKEN="sk-test"'
    )
    expect(buildKeyConfigFiles({ ...base, activeTab: 'cmd' })[1].path).toBe(
      '%USERPROFILE%\\.claude\\settings.json'
    )
  })

  it('openai codex: normalizes /v1 and writes config.toml with the catalog url', () => {
    const files = buildKeyConfigFiles({ ...base, platform: 'openai', activeClientTab: 'codex' })
    const all = files.map((f) => f.content).join('\n')
    expect(all).toContain('https://api.example.com/v1')
    expect(all).toContain('model_catalog_url')
  })

  it('opencode: valid JSON with provider baseURL', () => {
    const [file] = buildKeyConfigFiles({ ...base, platform: 'openai', activeClientTab: 'opencode' })
    const json = JSON.parse(file.content)
    expect(json.provider.openai.options.baseURL).toBe('https://api.example.com/v1')
    expect(json.provider.openai.options.apiKey).toBe('sk-test')
  })

  it('gemini: uses the v1beta-free base for the CLI env', () => {
    const [file] = buildKeyConfigFiles({ ...base, platform: 'gemini', activeClientTab: 'gemini' })
    expect(file.content).toContain('GOOGLE_GEMINI_BASE_URL="https://api.example.com"')
  })
})
