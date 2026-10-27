/**
 * MiniMax 模型下拉列表（客户端半边）。
 *
 * 在会话输入框的 dock 注册一个入口，点击后打开模型设置窗口。
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

    const SELECT_STYLE = {
      display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '7px',
      padding: '9px 32px 9px 10px', border: '1px solid #dedfe4', borderRadius: '8px',
      color: '#292a30', backgroundColor: '#fff', fontSize: '13px', cursor: 'pointer',
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
        items.push(h('option', { key: FOLLOW, value: FOLLOW }, '跟随会话模型'));
      }
      let known = capability === 'vision' && value === FOLLOW;
      for (const entry of catalogFor(capability)) {
        if (entry.id === value) known = true;
        items.push(h('option', { key: entry.id, value: entry.id }, entry.id));
      }
      if (value && !known) {
        items.unshift(h('option', { key: value, value }, value));
      }
      const selected = catalogFor(capability).find((entry) => entry.id === value);
      const description = value === FOLLOW ? '自动使用当前会话中的 MiniMax 模型' : (selected ? selected.description : '使用当前配置指定的模型');
      return h('label', { style: { display: 'block', minWidth: 0 } },
        h('span', { style: { fontSize: '13px', fontWeight: 600, color: '#30313a' } }, CAPABILITY_LABELS[capability]),
        h('select', {
          value, disabled: Boolean(props.disabled), title: value, style: SELECT_STYLE,
          onChange: (event) => props.onChange(capability, event.target.value),
        }, items),
        h('span', { style: { display: 'block', marginTop: '5px', color: '#898a94', fontSize: '11px', lineHeight: 1.4 } }, description),
      );
    }

    function ModelDock(props) {
      const [selection, setSelection] = React.useState(null);
      const [reload, setReload] = React.useState(0);
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
      }, [props.sessionId, reload]);

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

      const [open, setOpen] = React.useState(false);
      React.useEffect(() => {
        if (!open) return;
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [open]);

      const pickers = selection && CAPABILITIES.map((capability) => h(Picker, {
        key: capability, capability, value: selection[capability] || '', disabled: busy, onChange: change,
      }));
      const button = h('button', {
        type: 'button', onClick: () => setOpen(true), 'aria-haspopup': 'dialog', 'aria-expanded': open,
        title: '配置 MiniMax 多模态模型',
        style: { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 9px',
          border: '1px solid rgba(128,128,128,.3)', borderRadius: '7px', background: 'transparent',
          color: 'inherit', fontSize: '12px', lineHeight: '18px', cursor: 'pointer', whiteSpace: 'nowrap' },
      }, h('span', { 'aria-hidden': true, style: { fontSize: '14px' } }, '⚙'), 'MiniMax');
      if (!open) return button;
      const panel = h('div', {
        role: 'dialog', 'aria-modal': true, 'aria-label': 'MiniMax 模型设置',
        onClick: (event) => event.stopPropagation(),
        style: { width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
          boxSizing: 'border-box', padding: '20px', background: '#fff', color: '#292a30', borderRadius: '16px',
          boxShadow: '0 20px 70px rgba(20,22,30,.24)', border: '1px solid rgba(0,0,0,.06)', fontFamily: 'inherit' },
      },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' } },
          h('div', null,
            h('div', { style: { fontSize: '16px', fontWeight: 700, letterSpacing: '.01em' } }, 'MiniMax 模型设置'),
            h('div', { style: { marginTop: '5px', color: '#898a94', fontSize: '12px', lineHeight: 1.5 } }, '选择各项功能使用的模型，修改后立即生效。')),
          h('button', { type: 'button', onClick: () => setOpen(false), 'aria-label': '关闭模型设置',
            style: { border: 0, background: '#f3f3f5', color: '#696a73', width: '28px', height: '28px',
              borderRadius: '8px', fontSize: '18px', cursor: 'pointer', lineHeight: '28px' } }, '×')),
        h('div', { style: { height: '1px', margin: '16px 0', background: '#efeff1' } }),
        error ? h('div', { role: 'alert', style: { color: '#ad3d38', fontSize: '12px', lineHeight: 1.5, marginBottom: '12px' } }, error) : null,
        !selection ? h('div', { style: { color: '#898a94', fontSize: '13px' } }, error ? h('button', { type: 'button', onClick: () => { setError(''); setReload((value) => value + 1); }, style: { border: '1px solid #dedfe4', borderRadius: '7px', padding: '6px 10px', background: '#fff', color: '#444', cursor: 'pointer' } }, '重新加载') : '正在加载模型…') :
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr', gap: '15px' } }, pickers),
        h('div', { style: { marginTop: '17px', paddingTop: '12px', borderTop: '1px solid #efeff1', color: '#a0a0a8', fontSize: '11px' } },
          busy ? '正在保存…' : '设置在插件运行期间有效')
      );
      return h(React.Fragment, null, button,
        h('div', { onClick: () => setOpen(false), style: { position: 'fixed', inset: 0, zIndex: 2147483000,
          background: 'rgba(25,26,32,.32)', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, panel));
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
