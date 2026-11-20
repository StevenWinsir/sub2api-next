/** 安装向导的纯逻辑（便于单测）。 */

export const MIN_ADMIN_PASSWORD_LENGTH = 8

export interface StepState {
  dbConnected: boolean
  redisConnected: boolean
  adminEmail: string
  adminPassword: string
  confirmPassword: string
}

/** 各步骤能否继续：数据库 / Redis 必须先测试连接成功；管理员邮箱必填，密码 ≥ 8 位且两次一致。 */
export function canProceedFromStep(step: number, s: StepState): boolean {
  switch (step) {
    case 0:
      return s.dbConnected
    case 1:
      return s.redisConnected
    case 2:
      return (
        Boolean(s.adminEmail) &&
        s.adminPassword.length >= MIN_ADMIN_PASSWORD_LENGTH &&
        s.adminPassword === s.confirmPassword
      )
    default:
      return true
  }
}

/** 取后端错误文案：detail → message → Error.message → 兜底。 */
export function extractSetupError(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: { detail?: string; message?: string } }; message?: string }
  return err.response?.data?.detail || err.response?.data?.message || err.message || fallback
}
