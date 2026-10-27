import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { apply } from '../index.mjs';
import { MODEL_CATALOG, canonicalVisionId, describeSelection, parseAssignments } from '../lib/models.mjs';
import { createModelSelection } from '../lib/selection.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7r8AAAAASUVORK5CYII=','base64');
const reply=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});

function harness(config={}) {
  const tools=new Map();
  const commands=new Map();
  const requests=[];
  const session={header:{cwd:'C:/work'},requestHeader:()=>({config:{model:'minimax-m3.1-flash'}})};
  const ctx={
    on:()=>{},
    systemPrompt:{section:()=>{}},
    sessionProjections:{stateOf:(_session,key)=>key==='modelSelection'?{lastUsed:{model:'minimax-m3.1-flash'}}:{lastTurn:3,openTurnStartSeq:1}},
    get:name=>name==='credentials'?{resolve:async()=>({value:'test-key'})}:undefined,
    inject:(names,callback)=>{if(names.includes('commands'))callback({commands:{register:definition=>commands.set(definition.name,definition)}});},
    tools:{register:definition=>tools.set(definition.name,definition)},
    fs:{resolve:async path=>path,stat:async()=>({type:'file'}),lstat:async()=>({type:'file'}),processPathFromHostPath:path=>path,readBytes:async()=>png},
    attachments:{saveImage:async()=>({}),saveFile:async()=>({}),fileHostPath:ref=>'C:/attachments/'+ref.name},
  };
  apply(ctx,config,{fetchImpl:async(url,options)=>{requests.push({url,body:options.body});return reply(url.endsWith('/chat/completions')?{choices:[{message:{content:'ok'}}]}:{data:{image_base64:[png.toString('base64')]}});}});
  const exec={callId:'call',signal:new AbortController().signal,agent:{session}};
  return {tools,commands,requests,exec};
}

const bodyOf=request=>JSON.parse(request.body);

test('the vision model follows the user session model by default',async()=>{
  const {tools,requests,exec}=harness();
  assert.equal(tools.size,8);
  await tools.get('minimax_understand_image').execute({file_path:'a.png'},exec);
  assert.equal(bodyOf(requests[0]).model,'MiniMax-M3.1-Flash');
});

test('an explicit vision model wins over the session model',async()=>{
  const {tools,requests,exec,commands}=harness();
  const result=commands.get('minimax-model').handler({agent:exec.agent,rawInput:'vision=MiniMax-M3'});
  assert.equal(result.kind,'success');
  assert.match(result.text,/vision=MiniMax-M3/);
  await tools.get('minimax_understand_image').execute({file_path:'a.png'},exec);
  assert.equal(bodyOf(requests[0]).model,'MiniMax-M3');
});

test('the command reads the current selection and reports errors',()=>{
  const {commands,exec}=harness();
  const empty=commands.get('minimax-model').handler({agent:exec.agent,rawInput:''});
  assert.equal(empty.kind,'success');
  assert.equal(empty.text,describeSelection({vision:'follow-session',image:'image-01-live',speech:'speech-2.8-turbo',transcription:'asr-1.0'}));
  const bad=commands.get('minimax-model').handler({agent:exec.agent,rawInput:'vision=nope'});
  assert.equal(bad.kind,'error');
  assert.match(bad.text,/目录/);
});

test('the select tool and the command share one host operation',async()=>{
  const {tools,commands,exec}=harness();
  const selected=await tools.get('minimax_select_model').execute({capability:'speech',model:'speech-2.8-hd'},exec);
  assert.match(selected.text,/speech=speech-2.8-hd/);
  assert.match(commands.get('minimax-model').handler({agent:exec.agent,rawInput:''}).text,/speech=speech-2.8-hd/);
  await assert.rejects(tools.get('minimax_select_model').execute({capability:'image',model:'speech-2.8-hd'},exec),/目录/);
  await assert.rejects(tools.get('minimax_select_model').execute({capability:'image',model:'image-01',extra:true},exec),/参数无效/);
});

test('the model list exposes the catalog and the effective models',async()=>{
  const {tools,exec}=harness();
  const listed=await tools.get('minimax_list_models').execute({},exec);
  for(const entry of MODEL_CATALOG)assert.match(listed.text,new RegExp(entry.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(listed.text,/跟随会话模型/);
  assert.equal(MODEL_CATALOG.filter(entry=>entry.description.length!==15).length,0);
});

test('model ids are normalized across the host and the platform',()=>{
  assert.equal(canonicalVisionId('minimax-m3.1-flash'),'MiniMax-M3.1-Flash');
  assert.equal(canonicalVisionId('MiniMax-M3.1-Flash'),'MiniMax-M3.1-Flash');
  assert.equal(canonicalVisionId('deepseek-chat'),undefined);
  assert.deepEqual(parseAssignments('vision=follow-session image=image-01-live').assignments,{vision:'follow-session',image:'image-01-live'});
  assert.equal(parseAssignments('image=image-01-live').errors.length,0);
  assert.equal(parseAssignments('image=nope').errors.length,1);
});

test('the selection store keeps explicit choices above the configuration',()=>{
  const selection=createModelSelection({visionModel:'follow-session',imageModel:'image-01-live'});
  assert.equal(selection.effectiveOf('image'),'image-01-live');
  assert.equal(selection.effectiveOf('vision'),'follow-session');
  selection.select('image','image-01');
  assert.equal(selection.effectiveOf('image'),'image-01');
  selection.clear('image');
  assert.equal(selection.effectiveOf('image'),'image-01-live');
});

test('the client bundle registers the model picker under the composer',async()=>{
  const source=await readFile(new URL('../lib/client.js',import.meta.url),'utf8');
  let captured;
  new Function('window',source)({__ModuleLoader__:{load:row=>{captured=row;}}});
  assert.equal(captured.id,'dsh-minimax-multimodal');
  const react={createElement:()=>null,useState:()=>[null,()=>{}],useEffect:()=>{}};
  const module=captured.factory(name=>{assert.equal(name,'react');return react;});
  assert.ok(module.inject.includes('slots'));
  const registrations=[];
  const ctx={slots:{inject:(_name,fn)=>fn(),register:(definition,component)=>registrations.push({definition,component})},remote:{commands:{execute:async()=>({ok:true,value:{result:{kind:'success',text:''}}})}}};
  module.apply(ctx);
  assert.equal(registrations.length,1);
  assert.equal(registrations[0].definition.name,'conversation.composer.dock');
  const props=registrations[0].definition.inject('session-1');
  assert.equal(typeof props.load,'function');
  assert.equal(typeof props.apply,'function');
  for(const entry of MODEL_CATALOG){assert.ok(source.includes("'"+entry.id+"'"));assert.ok(source.includes(entry.description));}
});
