import { basename, extname } from 'node:path';
import { MiniMaxApi, MultimodalError, checkedText, imageMediaType } from './lib/api.mjs';
import { createPresenter } from './lib/presentation.mjs';
export const name='minimax-multimodal';
export const inject=['tools','fs','attachments','sessionProjections','systemPrompt'];
const OUTPUT={type:'object',additionalProperties:false,required:['text','images','files'],properties:{
  text:{type:'string'},images:{type:'array',items:{type:'object',additionalProperties:true}},files:{type:'array',items:{type:'object',additionalProperties:true}}}};
const result=(text,images=[],files=[])=>({text,images,files});
function render(_args,value) {return [{type:'text',text:value.text},...value.images.map(attachment=>({type:'image',attachment})),...value.files.map(attachment=>({type:'file',attachment}))];}
export async function resolveKey(ctx,config,env=process.env) {
  const refs=[config.credentialRef,...(config.region==='global'?['MINIMAX_API_KEY']:['MINIMAX_CN_API_KEY','MINIMAX_API_KEY'])].filter(Boolean);
  for(const ref of [...new Set(refs)]) {
    try {const hit=await ctx.get('credentials')?.resolve(ref); if(typeof hit?.value==='string'&&hit.value.trim())return hit.value;} catch{}
    if(typeof env[ref]==='string'&&env[ref].trim())return env[ref];
  }
  return '';
}
async function readInput(ctx,exec,path,maximum) {
  checkedText(path,'文件路径',4096);
  const target=await ctx.fs.resolve(path,{cwd:exec.agent?.session.header.cwd,signal:exec.signal});
  const info=await ctx.fs.stat(target,exec.signal);
  if(!info||info.type!=='file')throw new MultimodalError('找不到指定文件，或它不是普通文件。');
  const data=Buffer.from(await ctx.fs.readBytes(target,exec.signal,maximum));
  if(data.length>maximum)throw new MultimodalError('文件超过大小限制。');
  return data;
}
export function apply(ctx,options={},dependencies={}) {
  const config={region:'cn',visionModel:'MiniMax-M3',imageModel:'image-01',speechModel:'speech-2.8-turbo',transcriptionModel:'asr-1.0',defaultVoice:'male-qn-qingse',...options};
  for(const field of ['visionModel','imageModel','speechModel','transcriptionModel','defaultVoice'])checkedText(config[field],field,120);
  if(config.credentialRef)checkedText(config.credentialRef,'credentialRef',120);
  const api=new MiniMaxApi({region:config.region,resolveKey:()=>resolveKey(ctx,config),fetchImpl:dependencies.fetchImpl});
  const presenter=createPresenter(ctx);
  ctx.systemPrompt.section({name:'minimax-multimodal:delivery',order:10150,interpolate:false,text:
    'MiniMax generated media delivery: minimax_generate_image and minimax_speak automatically register the generated file with the DSH present/deliverables mechanism on successful completion. The GUI renders a file card below the reply. Do not invent Markdown image URLs, attachment:// URLs, or paths. Do not claim success if the tool failed. On success, briefly identify the generated media and direct the user to the automatically presented card to preview/open it. Do not call present again for the same generated file. This automatic presentation applies only to these two tools; other deliverables still use present normally.'});
  function register(tool,execute) {
    ctx.tools.register({...tool,timeoutMs:130000,isConcurrencySafe:()=>true,output:{schema:OUTPUT,render},
      async execute(args,exec) {
        if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(tool.parameters.properties,k)))throw new MultimodalError('工具参数无效。');
        exec.signal?.throwIfAborted();
        try {return await execute(args,exec);} catch(error) {
          exec.signal?.throwIfAborted();
          if(error instanceof MultimodalError)throw error;
          throw new MultimodalError('多模态操作失败，请检查文件、网络或 DSH 附件服务。');
        }
      }});
  }
  const schema=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
  const str=description=>({type:'string',description});
  register({name:'minimax_understand_image',description:'Use MiniMax-M3 to understand a local PNG/JPEG/WebP/GIF screenshot or picture and answer a specific question. Read access is enforced by the current DSH filesystem. Use this when native image input is unavailable.',parameters:schema({file_path:str('Image path; relative to this session workspace.'),question:str('Question about the picture.')},['file_path'])},async(args,exec)=>{
    const bytes=await readInput(ctx,exec,args.file_path,10*1024*1024);
    return result(await api.understandImage(bytes,args.question||'请详细描述图片内容，保留其中的文字、报错和重要细节。',config.visionModel,exec.signal));
  });
  register({name:'minimax_generate_image',description:'Generate one picture from a text description with the MiniMax image model. Consumes MiniMax image quota. Automatically presents the generated file as a DSH delivery card on success. Do not invent Markdown image links or call present again.',parameters:schema({prompt:str('Describe the desired image in detail.'),aspect_ratio:{type:'string',enum:['1:1','16:9','9:16','4:3','3:4','3:2','2:3','21:9']}},['prompt'])},async(args,exec)=>{
    const delivery=presenter.prepare(exec);
    const data=await api.generateImage(args.prompt,args.aspect_ratio||'1:1',config.imageModel,exec.signal);exec.signal?.throwIfAborted();
    const mediaType=imageMediaType(data);
    const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[mediaType];
    const name='minimax-'+Date.now()+'.'+extension;
    const image=await ctx.attachments.saveImage({data,mediaType,name});
    const file=await ctx.attachments.saveFile({data,name});
    await presenter.stage(exec,delivery,file,'MiniMax 生成图片');
    return result('MiniMax 图片已生成，已自动登记展示卡片。请提示用户从回复下方的文件卡片预览或打开图片，不要再编造 Markdown 图片链接或重复调用 present。',[image]);
  });
  register({name:'minimax_speak',description:'Synthesize spoken audio from text with MiniMax and automatically present an MP3 file card in DSH. Do not call present again. This is text-to-speech, not music generation or real-time voice chat. Use minimax_list_voices to choose a system voice.',parameters:schema({text:str('Text to read, up to 3000 characters.'),voice_id:str('Optional MiniMax system voice ID.')},['text'])},async(args,exec)=>{
    const delivery=presenter.prepare(exec);
    const data=await api.synthesize(args.text,args.voice_id||config.defaultVoice,config.speechModel,exec.signal);exec.signal?.throwIfAborted();
    const file=await ctx.attachments.saveFile({data,name:'minimax-speech-'+Date.now()+'.mp3'});
    await presenter.stage(exec,delivery,file,'MiniMax MP3 语音');
    return result('MP3 语音已生成，已自动登记展示卡片。请提示用户从回复下方的文件卡片打开或下载 MP3，不要重复调用 present。',[],[file]);
  });
  register({name:'minimax_transcribe_audio',description:'Transcribe a local audio file into text with MiniMax ASR. Supports WAV/AIFF/FLAC/M4A/MP3/AAC/OPUS/OGG, up to 50 MB and vendor maximum 500 seconds. Paths are resolved in this session workspace.',parameters:schema({file_path:str('Audio file path.')},['file_path'])},async(args,exec)=>{
    const path=checkedText(args.file_path,'文件路径',4096);
    if(!['.wav','.aiff','.aif','.flac','.m4a','.mp3','.aac','.opus','.ogg'].includes(extname(path).toLowerCase()))throw new MultimodalError('不支持的音频格式。');
    const bytes=await readInput(ctx,exec,path,50*1024*1024);
    return result(await api.transcribe(bytes,basename(path),config.transcriptionModel,exec.signal));
  });
  register({name:'minimax_list_voices',description:'List MiniMax system text-to-speech voice IDs and descriptions. Use a returned ID with minimax_speak.',parameters:schema({})},async(_args,exec)=>{
    const voices=await api.voices(exec.signal);return result(voices.map(v=>v.id+' | '+v.name+' | '+v.description).join('\n'));
  });
}
