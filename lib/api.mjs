const ROOTS = { cn: 'https://api.minimaxi.com/v1', global: 'https://api.minimax.io/v1' };
const ROUTES = new Set(['/chat/completions', '/image_generation', '/t2a_v2', '/speech_to_text', '/get_voice']);
export class MultimodalError extends Error {}
export function checkedText(value, label, maximum = 10000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new MultimodalError(label + '不能为空，且长度不能超过 ' + maximum + '。');
  return value.trim();
}
export function imageMediaType(data) {
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(data.subarray(0,6).toString())) return 'image/gif';
  if (data.subarray(0,4).toString()==='RIFF' && data.subarray(8,12).toString()==='WEBP') return 'image/webp';
  throw new MultimodalError('图片格式必须为 PNG、JPEG、WebP 或 GIF。');
}
export async function boundedBody(response, maximum, signal) {
  const reader = response.body?.getReader();
  if (!reader) throw new MultimodalError('MiniMax 返回了空响应。');
  const parts = []; let size = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new MultimodalError('MiniMax 返回的文件超过大小限制。'); }
      parts.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
export class MiniMaxApi {
  constructor({ region='cn', resolveKey, fetchImpl=fetch }) {
    if (!Object.hasOwn(ROOTS, region)) throw new MultimodalError('region 必须是 cn 或 global。');
    this.root = ROOTS[region]; this.resolveKey = resolveKey; this.fetch = fetchImpl;
  }
  async request(route, payload, { signal, multipart=false, maximum=40*1024*1024 } = {}) {
    if (!ROUTES.has(route)) throw new MultimodalError('接口路径无效。');
    signal?.throwIfAborted();
    const key = await this.resolveKey();
    if (typeof key !== 'string' || !key.trim()) throw new MultimodalError('未配置 MiniMax 密钥。请在 DSH 设置 → 模型中保存 MiniMax Key。');
    const abort = signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000);
    let response;
    try {
      response = await this.fetch(this.root + route, { method:'POST', redirect:'error', signal:abort,
        headers: { Authorization:'Bearer ' + key.trim(), ...(multipart ? {} : {'Content-Type':'application/json'}) },
        body:multipart ? payload : JSON.stringify(payload) });
    } catch {
      signal?.throwIfAborted();
      throw new MultimodalError('MiniMax 请求失败或超时，请检查网络。');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(()=>{});
      if ([401,403].includes(response.status)) throw new MultimodalError('MiniMax 密钥无效，或此 Key 没有该能力的权限。');
      if (response.status===429) throw new MultimodalError('MiniMax 限流或额度不足，请稍后重试。');
      throw new MultimodalError('MiniMax 接口失败（HTTP ' + response.status + '）。');
    }
    let body;
    try { body=JSON.parse((await boundedBody(response,maximum,abort)).toString('utf8')); }
    catch (error) { if (error instanceof MultimodalError) throw error; signal?.throwIfAborted(); throw new MultimodalError('MiniMax 返回了无效响应。'); }
    const code = Number(body?.base_resp?.status_code || 0);
    if (code !== 0) throw new MultimodalError('MiniMax 拒绝了请求（错误码 ' + code + '）。请检查模型权限、密钥和套餐额度。');
    return body;
  }
  async understandImage(data, question, model, signal) {
    const type = imageMediaType(data);
    const body = await this.request('/chat/completions', { model, stream:false, max_tokens:2048, reasoning_split:true,
      messages:[{role:'user',content:[{type:'text',text:checkedText(question,'问题')}, {type:'image_url',image_url:{url:'data:'+type+';base64,'+data.toString('base64')}}]}] }, {signal, maximum:2*1024*1024});
    const text=body?.choices?.[0]?.message?.content;
    if (typeof text!=='string' || !text.trim()) throw new MultimodalError('MiniMax 没有返回识图结果。');
    return text;
  }
  async generateImage(prompt, aspect, model, signal) {
    if (!['1:1','16:9','9:16','4:3','3:4','3:2','2:3','21:9'].includes(aspect)) throw new MultimodalError('图片比例无效。');
    const body=await this.request('/image_generation', {model,prompt:checkedText(prompt,'图片描述',1500),aspect_ratio:aspect,n:1,response_format:'base64',prompt_optimizer:true}, {signal});
    const encoded=body?.data?.image_base64?.[0];
    if (typeof encoded!=='string') throw new MultimodalError('MiniMax 没有返回图片数据。');
    const plain=encoded.replace(/^data:image\/[a-z]+;base64,/i,'');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(plain) || !plain.length || plain.length%4!==0) throw new MultimodalError('MiniMax 图片数据无效。');
    const data=Buffer.from(plain,'base64'); imageMediaType(data); return data;
  }
  async synthesize(text, voice, model, signal) {
    const body=await this.request('/t2a_v2',{model,text:checkedText(text,'朗读文本',3000),stream:false,output_format:'hex',
      voice_setting:{voice_id:checkedText(voice,'音色 ID',120),speed:1,vol:1,pitch:0},
      audio_setting:{sample_rate:32000,bitrate:128000,format:'mp3',channel:1}}, {signal});
    const hex=body?.data?.audio;
    if (typeof hex!=='string' || !hex.length || hex.length%2 || !/^[0-9a-f]+$/i.test(hex)) throw new MultimodalError('MiniMax 没有返回有效音频。');
    return Buffer.from(hex,'hex');
  }
  async transcribe(data, filename, model, signal) {
    const form=new FormData(); form.append('model',model); form.append('response_format','json'); form.append('stream','false');
    form.append('file',new Blob([data]),filename);
    const body=await this.request('/speech_to_text',form,{signal,multipart:true,maximum:2*1024*1024});
    if (typeof body?.text!=='string') throw new MultimodalError('MiniMax 没有返回语音转写结果。');
    return body.text;
  }
  async voices(signal) {
    const body=await this.request('/get_voice',{voice_type:'system'},{signal,maximum:2*1024*1024});
    const voices=body?.system_voice;
    if (!Array.isArray(voices)) throw new MultimodalError('MiniMax 没有返回音色列表。');
    return voices.map(v=>({id:String(v.voice_id||''),name:String(v.voice_name||''),description:Array.isArray(v.description)?v.description.join('；'):String(v.description||'')}));
  }
}
