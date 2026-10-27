/**
 * MiniMax 模型下拉列表（客户端半边）。
 *
 * 注册在会话输入框下方的 dock 槽位里，每个能力一个下拉框，选项带一句话简介。
 * 选择结果通过宿主斜杠命令 /minimax-model 写回，与 agent 工具 minimax_select_model
 * 共用同一个宿主操作，界面和工具不会各自维护一套逻辑。
 *
 * 客户端包按 DSH 的 lazy-CJS 约定手写，无需构建工具：
 *   window.__ModuleLoader__.load({ id, factory(require) })
 * 依赖只允许平台模块表里的 react，样式用内联样式，不引第三方组件库。
 */

window.__ModuleLoader__.load({
  id: 'dsh-minimax-multimodal',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** 能力键，顺序与 lib/models.mjs 一致。 */
    const CAPABILITIES = ['vision', 'image', 'speech', 'transcription'];
    /** 能力键的展示标签。 */
    const CAPABILITY_LABELS = { vision: '识图', image: '生图', speech: '语音', transcription: '转写' };
    /** 识图能力取“跟随会话模型”时使用的取值。 */
    const FOLLOW = 'follow-session';
    /** 模型目录，需与 lib/models.mjs 保持一致（tests/plugin.test.mjs 会校验）。 */
    const CATALOG = [
      { capability: 'vision', id: 'MiniMax-M3.1-Flash', description: '原生多模态模型，支持图视频理解' },
      { capability: 'vision', id: 'MiniMax-M3', description: '前沿多模态编码模型，百万上下文' },
      { capability: 'vision', id: 'MiniMax-M2.7', description: '递归自我改进，工程交付能力更强' },
      { capability: 'vision', id: 'MiniMax-M2.7-highspeed', description: '高速推理版本，日常响应速度更快' },
      { capability: 'image', id: 'image-01-live', description: '手绘卡通等画风增强，风格自由调' },
      { capability: 'image', id: 'image-01', description: '画面表现细腻，支持文生图图生图' },
      { capability: 'speech', id: 'speech-2.8-turbo', description: '最新极速版，支持四十种语言情感' },
      { capability: 'speech', id: 'speech-2.8-hd', description: '最新高清语音版，音色细节更逼真' },
      { capability: 'transcription', id: 'asr-1.0', description: '语音转文字，限五百秒五十兆以内' },
    ];

    const LABEL_STYLE = { fontSize: '12px', opacity: '0.75', whiteSpace: 'nowrap' };
    const SELECT_STYLE = {
      fontSize: '12px',
      maxWidth: '260px',
      color: 'inherit',
      background: 'transparent',
      border: '1px solid currentColor',
      borderRadius: '4px',
      padding: '2px 4px',
    };

    function catalogFor(capability) {
      return CATALOG.filter((entry) => entry.capability === capability);
    }

    /** 解析宿主回显的 `vision=follow-session | image=image-01-live`。 */
    function parseSelection(text) {
      const selection = {};
      for (const part of String(text || '').split('|')) {
        const index = part.indexOf('=');
        if (index <= 0) continue;
        selection[part.slice(0, index).trim()] = part.slice(index + 1).trim();
      }
      return selection;
    }

    /** 从命令响应里取回文本，失败时抛错。 */
    function readText(response) {
      if (!response || response.ok === false) {
        const error = response && response.error;
        throw new Error((error && error.message) || '模型选择命令执行失败');
      }
      const value = response.value || {};
      const payload = value.result || value;
      if (payload && payload.kind === 'error') throw new Error(payload.text || '模型选择命令执行失败');
      return typeof payload.text === 'string' ? payload.text : '';
    }

    function Picker(props) {
      const capability = props.capability;
      const value = props.value || '';
      const items = [];
      if (capability === 'vision') {
        items.push(h('option', { key: FOLLOW, value: FOLLOW }, '跟随会话模型｜使用用户当前会话模型'));
      }
      const known = capability === 'vision' && value === FOLLOW;
      for (const entry of catalogFor(capability)) {
        if (entry.id === value) known = true;
        items.push(h('option', { key: entry.id, value: entry.id }, entry.id + '｜' + entry.description));
      }
      if (value && !known) {
        items.unshift(h('option', { key: value, value }, value + '｜当前配置指定的模型'));
      }
      return h(
        'label',
        { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
        h('span', { style: LABEL_STYLE }, CAPABILITY_LABELS[capability]),
        h(
          'select',
          {
            value,
            disabled: Boolean(props.disabled),
            title: value,
            style: SELECT_STYLE,
            onChange: (event) => props.onChange(capability, event.target.value),
          },
          items,
        ),
      );
    }

    function ModelDock(props) {
      const [selection, setSelection] = React.useState(null);
      const [error, setError] = React.useState('');
      const [busy, setBusy] = React.useState(false);

      React.useEffect(() => {
        let cancelled = false;
        Promise.resolve()
          .then(() => props.load())
          .then((response) => {
            if (cancelled) return;
            setSelection(parseSelection(readText(response)));
            setError('');
          })
          .catch((failure) => {
            if (cancelled) return;
            setError(failure && failure.message ? failure.message : String(failure));
          });
        return () => {
          cancelled = true;
        };
      }, [props.sessionId]);

      const change = (capability, model) => {
        setBusy(true);
        Promise.resolve()
          .then(() => props.apply(capability + '=' + model))
          .then((response) => {
            setSelection(parseSelection(readText(response)));
            setError('');
          })
          .catch((failure) => {
            setError(failure && failure.message ? failure.message : String(failure));
          })
          .finally(() => setBusy(false));
      };

      const style = {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '10px',
        padding: '2px 0',
        fontSize: '12px',
      };

      if (error) {
        return h(
          'div',
          { style: style, title: error },
          h('span', { style: LABEL_STYLE }, 'MiniMax 模型'),
          h('span', { style: { ...LABEL_STYLE, opacity: '0.6' } }, '不可用：' + error),
        );
      }
      if (!selection) return h('div', { style: style }, h('span', { style: LABEL_STYLE }, 'MiniMax 模型：加载中…'));

      const pickers = CAPABILITIES.map((capability) =>
        h(Picker, {
          key: capability,
          capability,
          value: selection[capability] || '',
          disabled: busy,
          onChange: change,
        }),
      );
      return h('div', { style: style }, h('span', { style: LABEL_STYLE }, 'MiniMax 模型'), pickers);
    }

    return {
      inject: ['slots', 'remote', 'remote.commands'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'minimax-models',
              order: 20,
              inject: (sessionId) => ({
                sessionId,
                load: () => ctx.remote.commands.execute(sessionId, '/minimax-model', []),
                apply: (assignment) => ctx.remote.commands.execute(sessionId, '/minimax-model ' + assignment, []),
              }),
            },
            ModelDock,
          ),
        );
      },
    };
  },
});
