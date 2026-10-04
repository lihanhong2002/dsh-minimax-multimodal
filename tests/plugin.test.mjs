import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MiniMaxApi } from '../lib/api.mjs';
import { apply, resolveKey } from '../index.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7r8AAAAASUVORK5CYII=','base64');
const reply=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
test('fixed API destinations, authenticated multipart, native image bytes and generation payload',async()=>{
  const seen=[];
  const api=new MiniMaxApi({resolveKey:async()=> 'test-key',fetchImpl:async(url,options)=>{seen.push({url,options});return reply(url.endsWith('/image_generation')?{data:{image_base64:[png.toString('base64')]}}:url.endsWith('/t2a_v2')?{data:{audio:'494433'}}:url.endsWith('/speech_to_text')?{text:'你好'}:{choices:[{message:{content:'a white square'}}]});}});
  assert.match(await api.understandImage(png,'What is in it?','MiniMax-M3'),/white/);
  const imageRequest=JSON.parse(seen[0].options.body);assert.equal(imageRequest.messages[0].content[1].image_url.url,'data:image/png;base64,'+png.toString('base64'));
  assert.deepEqual(await api.generateImage('a small whale','1:1','image-01'),png);
  assert.equal(JSON.parse(seen[1].options.body).n,1);assert.equal(JSON.parse(seen[1].options.body).response_format,'base64');
  assert.equal((await api.synthesize('你好','male-qn-qingse','speech-2.8-turbo')).toString(),'ID3');
  assert.equal(await api.transcribe(Buffer.from('audio'),'a.mp3','asr-1.0'),'你好');
  assert.equal(seen[3].options.headers['Content-Type'],undefined);assert.equal(seen[3].options.body.get('file').name,'a.mp3');
  assert.ok(seen.every(({url,options})=>url.startsWith('https://api.minimaxi.com/v1/')&&options.redirect==='error'&&options.headers.Authorization==='Bearer test-key'));
  await assert.rejects(api.request('/private-route',{}));
  await assert.rejects(api.generateImage('x','100:1','image-01'));
});
test('missing credentials, upstream errors, malformed data and cancellation do not expose secrets',async()=>{
  const empty=new MiniMaxApi({resolveKey:async()=>'',fetchImpl:()=>{throw Error('must not fetch');}});await assert.rejects(empty.voices(),/未配置/);
  for(const response of [new Response('',{status:403}),reply({base_resp:{status_code:1004,status_msg:'test-key'}}),new Response('not json'),reply({data:{audio:'zz'}})]){
    const api=new MiniMaxApi({resolveKey:async()=> 'test-key',fetchImpl:async()=>response});await assert.rejects(api.synthesize('hi','voice','speech'),e=>!e.message.includes('test-key'));
  }
  const api=new MiniMaxApi({resolveKey:async()=> 'test-key',fetchImpl:async()=>new Response('x'.repeat(1025))});await assert.rejects(api.request('/get_voice',{}, {maximum:1024}),/大小限制/);
  const controller=new AbortController();controller.abort();await assert.rejects(api.voices(controller.signal),e=>e.name==='AbortError');
});
test('host tools use session filesystem access and durable image/audio attachments',async()=>{
  const tools=new Map(),operations=[],hooks={},events=[],ctx={
    on:(name,handler)=>hooks[name]=handler,
    systemPrompt:{section:section=>assert.match(section.text,/automatically register/)},
    sessionProjections:{stateOf:()=>({lastTurn:3,openTurnStartSeq:1})},
    get:name=>name==='credentials'?{resolve:async ref=>({value:ref==='MINIMAX_CN_API_KEY'?'test-key':''})}:undefined,
    tools:{register:def=>tools.set(def.name,def)},
    fs:{resolve:async(path,options)=>{operations.push({path,...options});return path;},stat:async()=>({type:'file'}),lstat:async()=>({type:'file'}),processPathFromHostPath:path=>path,readBytes:async()=>png},
    attachments:{saveImage:async({data,mediaType})=>{assert.deepEqual(Buffer.from(data),png);assert.equal(mediaType,'image/png');return{attachmentId:'image-id',mediaType,bytes:data.length,width:1,height:1};},saveFile:async({name})=>({attachmentId:'file-id',name,bytes:3}),fileHostPath:ref=>'C:/attachments/'+ref.name},
  };
  apply(ctx,{}, {fetchImpl:async url=>reply(url.endsWith('/image_generation')?{data:{image_base64:[png.toString('base64')]}}:url.endsWith('/t2a_v2')?{data:{audio:'494433'}}:url.endsWith('/speech_to_text')?{text:'voice text'}:{choices:[{message:{content:'a white square'}}]})});
  assert.equal(tools.size,5);
  const exec={callId:'image-call',signal:new AbortController().signal,agent:{session:{header:{cwd:'C:/work'},append:(type,data)=>events.push({type,data})}}};
  const vision=await tools.get('minimax_understand_image').execute({file_path:'a.png'},exec);assert.equal(vision.text,'a white square');assert.equal(operations[0].cwd,'C:/work');
  const image=await tools.get('minimax_generate_image').execute({prompt:'a whale'},exec);assert.equal(tools.get('minimax_generate_image').output.render({},image)[1].type,'image');
  assert.equal(events.length,0);hooks['tools/result'](exec,{isError:false});
  assert.equal(events[0].type,'deliverables/presented');assert.equal(events[0].data.turn,3);assert.equal(events[0].data.callId,'image-call');assert.match(events[0].data.files[0].path,/\.png$/);
  hooks['tools/result'](exec,{isError:false});assert.equal(events.length,1);
  const audio=await tools.get('minimax_speak').execute({text:'你好'},exec);assert.equal(tools.get('minimax_speak').output.render({},audio)[1].type,'file');
  hooks['tools/result'](exec,{isError:false});assert.match(events[1].data.files[0].path,/\.mp3$/);
  await tools.get('minimax_generate_image').execute({prompt:'a whale'},exec);hooks['tools/result'](exec,{isError:true});assert.equal(events.length,2);
  await tools.get('minimax_generate_image').execute({prompt:'a whale'},exec);ctx.sessionProjections.stateOf=()=>({lastTurn:4,openTurnStartSeq:2});hooks['tools/result'](exec,{isError:false});assert.equal(events.length,2);
  ctx.sessionProjections.stateOf=()=>({lastTurn:4,openTurnStartSeq:null});await assert.rejects(tools.get('minimax_generate_image').execute({prompt:'x'},exec),/正在进行/);
  assert.equal((await tools.get('minimax_transcribe_audio').execute({file_path:'a.mp3'},exec)).text,'voice text');
  await assert.rejects(tools.get('minimax_generate_image').execute({prompt:'a',endpoint:'attacker'},exec),/参数无效/);
  ctx.fs.readBytes=async()=>{throw Error('forbidden private-path test-key');};await assert.rejects(tools.get('minimax_understand_image').execute({file_path:'secret.png'},exec),e=>!e.message.includes('test-key'));
});
test('credentials resolve only references, using the region-appropriate names',async()=>{
  const refs=[];
  const ctx={get:()=>({resolve:async name=>{refs.push(name);return{value:name==='MINIMAX_CN_API_KEY'?'cn-key':undefined};}})};
  assert.equal(await resolveKey(ctx,{region:'cn'},{}),'cn-key');assert.deepEqual(refs,['MINIMAX_CN_API_KEY']);
  assert.equal(await resolveKey({get:()=>undefined},{region:'global'},{MINIMAX_API_KEY:'global-key'}),'global-key');
});
