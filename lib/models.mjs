/**
 * MiniMax 模型目录。
 *
 * 同一份数据服务两个用途：
 *   1. 运行时按能力解析实际生效的模型（vision / image / speech / transcription）；
 *   2. 客户端模型下拉列表的数据源（模型 id + 一句话简介）。
 *
 * 目录里只列 MiniMax 开放平台真实存在的模型 id。识图模型另见 VISION_ALIASES：
 * 宿主侧的模型 id 与平台 id 大小写、分隔符不一致，需要归一后才能填进 /chat/completions。
 */

/** 插件支持的能力键。 */
export const CAPABILITIES = ['vision', 'image', 'speech', 'transcription'];

/** 每个能力对应的配置键。 */
export const CAPABILITY_CONFIG = {
  vision: 'visionModel',
  image: 'imageModel',
  speech: 'speechModel',
  transcription: 'transcriptionModel',
};

/** 能力键的展示标签，供下拉列表分组与命令回显使用。 */
export const CAPABILITY_LABELS = {
  vision: '识图',
  image: '生图',
  speech: '语音',
  transcription: '转写',
};

/** 识图能力取“跟随会话模型”时使用的取值。 */
export const FOLLOW_SESSION = 'follow-session';

/**
 * 模型目录。description 为一句话简介（15 字），供下拉列表直接展示。
 * default 标记该能力的默认模型。
 */
export const MODEL_CATALOG = [
  { capability: 'vision', id: 'MiniMax-M3.1-Flash', description: '原生多模态模型，支持图视频理解', default: true },
  { capability: 'vision', id: 'MiniMax-M3', description: '前沿多模态编码模型，百万上下文' },
  { capability: 'vision', id: 'MiniMax-M2.7', description: '递归自我改进，工程交付能力更强' },
  { capability: 'vision', id: 'MiniMax-M2.7-highspeed', description: '高速推理版本，日常响应速度更快' },
  { capability: 'image', id: 'image-01-live', description: '手绘卡通等画风增强，风格自由调', default: true },
  { capability: 'image', id: 'image-01', description: '画面表现细腻，支持文生图图生图' },
  { capability: 'speech', id: 'speech-2.8-turbo', description: '最新极速版，支持四十种语言情感', default: true },
  { capability: 'speech', id: 'speech-2.8-hd', description: '最新高清语音版，音色细节更逼真' },
  { capability: 'transcription', id: 'asr-1.0', description: '语音转文字，限五百秒五十兆以内', default: true },
];

/**
 * 宿主侧模型 id → MiniMax 平台模型 id。
 * 键是归一化形式（小写并去掉所有分隔符），因此 `minimax-m3.1-flash`、
 * `MiniMax-M3.1-Flash`、`minimax_m3_1_flash` 都能命中同一条。
 */
const VISION_ALIASES = new Map([
  ['minimaxm31flash', 'MiniMax-M3.1-Flash'],
  ['minimaxm31flashpreview', 'MiniMax-M3.1-Flash-Preview'],
  ['minimaxm3', 'MiniMax-M3'],
  ['minimaxm27highspeed', 'MiniMax-M2.7-highspeed'],
  ['minimaxm27', 'MiniMax-M2.7'],
  ['minimaxm25', 'MiniMax-M2.5'],
  ['minimaxm21', 'MiniMax-M2.1'],
  ['minimaxm1', 'MiniMax-M1'],
]);

/** 归一化模型 id：小写并去掉分隔符，用于跨命名空间比较。 */
export function normalizeModelId(id) {
  return typeof id === 'string' ? id.trim().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

/**
 * 把宿主侧的模型 id 解析成 MiniMax 平台的识图模型 id。
 * @param {unknown} id 宿主侧模型 id，例如 `minimax-m3.1-flash`。
 * @returns {string|undefined} 平台模型 id；不是 MiniMax 模型时返回 undefined。
 */
export function canonicalVisionId(id) {
  const key = normalizeModelId(id);
  if (!key) return undefined;
  return VISION_ALIASES.get(key);
}

/**
 * 平台 id 是否支持 reason 分离。M3 系支持，较早的模型不带 reasoning_split 参数。
 * @param {string} model 平台模型 id。
 * @returns {boolean} 是否附带 reasoning_split。
 */
export function supportsReasoningSplit(model) {
  return /^MiniMax-M3/i.test(String(model || ''));
}

/** 取某个能力下的全部模型。 */
export function catalogFor(capability) {
  return MODEL_CATALOG.filter((entry) => entry.capability === capability);
}

/** 取某个能力的默认模型 id。 */
export function defaultModelFor(capability) {
  const entry = MODEL_CATALOG.find((item) => item.capability === capability && item.default);
  return entry ? entry.id : undefined;
}

/**
 * 校验一个模型 id 是否属于某能力；不属于时返回 undefined。
 * @param {string} capability 能力键。
 * @param {unknown} id 模型 id。
 */
export function modelFor(capability, id) {
  if (typeof id !== 'string') return undefined;
  const key = normalizeModelId(id);
  const entry = catalogFor(capability).find((item) => normalizeModelId(item.id) === key);
  return entry ? entry.id : undefined;
}

/**
 * 取值是否为“跟随会话模型”。识图能力用这个取值表示跟随用户当前会话模型。
 * @param {unknown} value 待判断的取值。
 * @returns {boolean} 是否跟随会话模型。
 */
export function isFollowSession(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === FOLLOW_SESSION;
}

/**
 * 解析 `vision=follow-session image=image-01-live` 形式的赋值串。
 *
 * 命令行与工具参数共用同一套语法，解析后交给同一个宿主操作生效，
 * 避免界面与工具两套逻辑。
 * @param {unknown} text 命令行原始输入。
 * @returns {{assignments: Record<string,string>, errors: string[]}} 解析结果。
 */
export function parseAssignments(text) {
  const assignments = {};
  const errors = [];
  const source = typeof text === 'string' ? text.trim() : '';
  if (!source) return { assignments, errors };
  for (const part of source.split(/[\s,;]+/u)) {
    if (!part) continue;
    const index = part.indexOf('=');
    if (index <= 0) {
      errors.push(`无法解析「${part}」，应为 能力=模型`);
      continue;
    }
    const capability = part.slice(0, index).trim().toLowerCase();
    const model = part.slice(index + 1).trim();
    if (!CAPABILITIES.includes(capability)) {
      errors.push(`未知能力「${capability}」，可用：${CAPABILITIES.join('、')}`);
      continue;
    }
    if (capability === 'vision' && isFollowSession(model)) {
      assignments[capability] = FOLLOW_SESSION;
      continue;
    }
    const canonical = modelFor(capability, model);
    if (!canonical) {
      errors.push(`模型「${model}」不在${CAPABILITY_LABELS[capability]}目录中`);
      continue;
    }
    assignments[capability] = canonical;
  }
  return { assignments, errors };
}

/**
 * 把当前生效状态格式化成一行机器可解析的文本，供命令回显与客户端解析。
 * @param {Record<string,string>} selection 能力 → 模型 id。
 * @returns {string} 形如 `vision=follow-session | image=image-01-live`。
 */
export function describeSelection(selection) {
  return CAPABILITIES.map((capability) => `${capability}=${selection?.[capability] ?? ''}`).join(' | ');
}
