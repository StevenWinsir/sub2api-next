/** 完整语言包（core + console）：测试、类型与键完整性检查使用；运行时按 scope 分块加载。 */
import core from './core'
import consoleScope from './console'

export default {
  ...core,
  ...consoleScope,
}
