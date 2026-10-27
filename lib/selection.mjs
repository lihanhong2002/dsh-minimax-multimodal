/**
 * 模型选择状态。
 *
 * 一份状态服务三个调用方，保证「界面下拉」「斜杠命令」「agent 工具」走同一条路径：
 *   1. 客户端下拉列表 → 斜杠命令 → 这里；
 *   2. 斜杠命令 → 这里；
 *   3. agent 工具 minimax_select_model → 这里。
 *
 * 生效优先级：开发者显式选择 > 配置项（cordis.patch.yml）> 目录默认值。
 * 识图能力允许取 follow-session，表示跟随用户当前会话模型。
 */

import {
  CAPABILITIES,
  CAPABILITY_CONFIG,
  FOLLOW_SESSION,
  defaultModelFor,
  modelFor,
} from './models.mjs';

/**
 * 创建一份模型选择状态。
 * @param {Record<string, unknown>} config 插件配置，键名见 CAPABILITY_CONFIG。
 * @returns {object} 选择状态的操作集合。
 */
export function createModelSelection(config = {}) {
  /** @type {Map<string,string>} 开发者显式选择的能力 → 模型 id。 */
  const overrides = new Map();

  /** 配置里声明的默认模型，未声明时取目录默认值。 */
  const configured = () => {
    const result = {};
    for (const capability of CAPABILITIES) {
      const value = config[CAPABILITY_CONFIG[capability]];
      result[capability] = typeof value === 'string' && value.trim() ? value.trim() : defaultModelFor(capability);
    }
    return result;
  };

  /** 开发者显式选择的模型；未选择过返回 undefined。 */
  const overrideOf = (capability) => overrides.get(capability);

  /** 当前生效模型（未显式选择时用配置值）。 */
  const effectiveOf = (capability) => overrides.get(capability) ?? configured()[capability];

  /** 全部能力的生效快照。 */
  const snapshot = () => {
    const result = {};
    for (const capability of CAPABILITIES) result[capability] = effectiveOf(capability);
    return result;
  };

  /**
   * 设定某个能力的选择。
   * @param {string} capability 能力键。
   * @param {string} model 模型 id，或识图能力的 follow-session。
   * @returns {Record<string,string>} 生效快照。
   */
  const select = (capability, model) => {
    if (!CAPABILITIES.includes(capability)) throw new Error(`未知能力「${capability}」`);
    const value = capability === 'vision' && model === FOLLOW_SESSION ? FOLLOW_SESSION : modelFor(capability, model);
    if (!value) throw new Error(`模型「${model}」不在${capability}目录中`);
    overrides.set(capability, value);
    return snapshot();
  };

  /**
   * 清除某个能力的显式选择，回到配置值。
   * @param {string} capability 能力键。
   * @returns {Record<string,string>} 生效快照。
   */
  const clear = (capability) => {
    overrides.delete(capability);
    return snapshot();
  };

  return { configured, overrideOf, effectiveOf, snapshot, select, clear };
}
