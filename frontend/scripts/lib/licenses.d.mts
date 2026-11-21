export const ALLOWED: string[]
export const EXCEPTIONS: Record<string, string>
export function isAllowedLicense(expr: string): boolean
export function findViolations(
  byLicense: Record<string, { name: string }[]>
): { name: string; license: string }[]
