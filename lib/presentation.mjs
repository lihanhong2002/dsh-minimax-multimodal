import { MultimodalError } from './api.mjs';

// Publish the same Session delivery event as DSH's present tool, after the
// registry has accepted the final tool result. Never publish blocked results.
export function createPresenter(ctx) {
  const pending = new WeakMap();
  ctx.on('tools/result', (exec, outcome) => {
    const delivery = pending.get(exec);
    pending.delete(exec);
    if (!delivery || outcome.isError) return;
    const boundary = ctx.sessionProjections.stateOf(delivery.session, 'turnBoundary');
    if (boundary?.openTurnStartSeq === null || boundary?.lastTurn !== delivery.turn) return;
    delivery.session.append('deliverables/presented', {
      turn: delivery.turn, callId: exec.callId, files: delivery.files,
    });
  });
  return {
    prepare(exec) {
      const session = exec.agent?.session;
      const boundary = session && ctx.sessionProjections.stateOf(session, 'turnBoundary');
      if (!session?.header.cwd || !boundary || boundary.openTurnStartSeq == null) {
        throw new MultimodalError('生成图片或语音需要正在进行的 DSH 会话和工作目录，以便自动展示文件卡片。');
      }
      return { session, turn: boundary.lastTurn, files: [] };
    },
    async stage(exec, delivery, ref, description) {
      exec.signal?.throwIfAborted();
      const hostPath = ctx.attachments.fileHostPath(ref);
      const path = hostPath && ctx.fs.processPathFromHostPath(hostPath);
      if (!path) throw new MultimodalError('文件已保存，但当前附件服务不支持自动展示。请使用支持本地附件的 DSH 桌面客户端。');
      const options = { cwd: delivery.session.header.cwd, signal: exec.signal };
      const entry = await ctx.fs.lstat(path, options, exec.signal);
      if (entry?.type !== 'file') throw new MultimodalError('生成文件无法作为普通文件展示。');
      const target = await ctx.fs.resolve(path, options);
      const info = await ctx.fs.stat(target, exec.signal);
      if (info?.type !== 'file') throw new MultimodalError('生成文件无法通过 DSH 文件访问检查。');
      exec.signal?.throwIfAborted();
      delivery.files.push({ path, description });
      pending.set(exec, delivery);
    },
  };
}
