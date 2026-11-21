import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    'out/**',
    '.next/**',
    'coverage/**',
    'next-env.d.ts',
    'src/generated/**',
    'playwright-report/**',
    'public/**',
    // 从 Vue 版原样移植的契约层：保持与上游一致，避免无意义 diff（质量门禁里 any 清单见 README）
    'src/api/**',
    'src/utils/**',
    'src/types/**',
    'src/constants/platform*.ts',
    'src/i18n/locales/**',
    '**/__tests__/**'
  ]),
  {
    rules: {
      // 禁止 eval / new Function / 字符串定时器（后端 CSP 不允许 unsafe-eval）
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
])
