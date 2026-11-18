import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRepo,normalizeResourceLink,extractLinks,createInitialState,resourceSignals,resourceTagIds,STAR_SNAPSHOTS} from '../src/data.js';

test('GitHub variants resolve to one resource key without losing source path in the original body',()=>{
 const raw='https://github.com/Comfy-Org/ComfyUI/tree/master?utm_source=x#readme';
 assert.equal(normalizeRepo(raw).key,normalizeRepo('https://github.com/comfy-org/comfyui.git').key);
 assert.equal(normalizeRepo(raw).url,'https://github.com/Comfy-Org/ComfyUI');
 assert.deepEqual(extractLinks('看看 '+raw+'。'),[raw]);
});
test('resource identity accepts generic HTTPS and preserves meaningful query/path semantics',()=>{
 assert.equal(normalizeResourceLink('https://EXAMPLE.com/Video/?v=2&utm_source=x#intro').url,'https://example.com/Video?v=2');
 assert.notEqual(normalizeResourceLink('https://example.com/Video').key,normalizeResourceLink('https://example.com/video').key);
 for(const input of ['javascript:alert(1)','http://example.com','https://name:secret@example.com'])assert.equal(normalizeResourceLink(input),null);
});
test('same-topic reply references are deduplicated and never increase resource comments',()=>{
 const db=structuredClone(createInitialState()),before=resourceSignals(db,'comfyui');
 db.replies.push({id:'r-new',topicId:'sample-film',refs:['comfyui','comfyui']});
 assert.equal(resourceSignals(db,'comfyui').refs,before.refs);
 assert.equal(resourceSignals(db,'comfyui').comments,before.comments);
 db.topics.push({id:'another',refs:['comfyui'],status:'open'});
 assert.equal(resourceSignals(db,'comfyui').refs,before.refs+1);
});
test('hidden source replies/topics are excluded while a resource comment remains independent',()=>{
 const db=structuredClone(createInitialState());
 db.topics.push({id:'fresh',refs:[],status:'open'});
 db.replies.push({id:'r-fresh',topicId:'fresh',refs:['comfyui']});
 const before=resourceSignals(db,'comfyui');db.replies.at(-1).hidden=true;
 assert.equal(resourceSignals(db,'comfyui').refs,before.refs-1);
 db.comments.push({id:'c-fresh',resourceId:'comfyui',helpful:0});
 assert.equal(resourceSignals(db,'comfyui').comments,before.comments+1);
 assert.equal(db.replies.filter(r=>r.topicId==='fresh').length,1);
});
test('metadata loading does not suppress a resource reference and missing stars are not zero',()=>{
 const db=structuredClone(createInitialState());
 db.resources.push({id:'new',status:'listed',metadataState:'loading'});
 db.topics.push({id:'new-topic',refs:['new'],status:'open'});
 assert.equal(resourceSignals(db,'new').refs,1);
 assert.equal(STAR_SNAPSHOTS['unknown/repo'],undefined);
 assert.ok(Object.values(STAR_SNAPSHOTS).every(x=>Number.isInteger(x.stars)&&x.source.startsWith('https://api.github.com/')));
});

test('resource references replace only the mention range and keep following text', async()=>{
 const {insertResourceReference,resourceIdsInText}=await import('../src/data.js');
 const text='先用 @Com 再剪辑',start=text.indexOf('@'),end=text.indexOf(' 再');
 const result=insertResourceReference(text,start,end,{id:'comfyui',name:'ComfyUI'});
 assert.equal(result.text,'先用 [ComfyUI](#/resource/comfyui) 再剪辑');
 assert.equal(result.text.slice(result.cursor),' 再剪辑');
 assert.deepEqual(resourceIdsInText(result.text+' [再次引用](#/resource/comfyui)'),['comfyui']);
});
test('one topic has one valid node, resources have multiple tags and no resource node or topic type exists',async()=>{
 const {NODES,DOMAINS,nodeAvailable}=await import('../src/data.js');const state=createInitialState();
 assert.ok(state.topics.every(t=>NODES.some(n=>n.id===t.nodeId)&&!('tags' in t)&&!('stages' in t)&&!('kind' in t)));
 assert.ok(state.topics.every(t=>DOMAINS.some(d=>d.id===t.domainId)&&nodeAvailable(t.domainId,t.nodeId)));
 assert.ok(NODES.every(n=>!('parentId' in n)));
 assert.ok(state.resources.some(r=>resourceTagIds(r).length>1));
 assert.ok(state.resources.every(r=>!('nodeIds' in r)));
 assert.ok(!('practiceSelections' in state));
 assert.notEqual(normalizeResourceLink('https://example.com/#/models/a').key,normalizeResourceLink('https://example.com/#/models/b').key);
});

test('column, node and tag filters respect independent content models',async()=>{
 const {selectFeed}=await import('../src/data.js');const db=createInitialState();
 const all=selectFeed(db);assert.ok(all.some(x=>x.type==='topic')&&all.some(x=>x.type==='resource'));
 assert.ok(selectFeed(db,{view:'topics'}).every(x=>x.type==='topic'));
 assert.ok(selectFeed(db,{view:'resources'}).every(x=>x.type==='resource'));
 const scoped=selectFeed(db,{nodeId:'solution-requests',tagId:'python'});
 assert.ok(scoped.some(x=>x.type==='topic')&&scoped.some(x=>x.type==='resource'));
 for(const x of scoped) assert.ok(x.type==='topic'?x.item.nodeId==='solution-requests':resourceTagIds(x.item).includes('python'));
 const tagOnly=selectFeed(db,{nodeId:'all',tagId:'subtitles'});
 assert.equal(tagOnly.filter(x=>x.type==='topic').length,db.topics.length);
 const nodeOnly=selectFeed(db,{nodeId:'editing'});
 assert.equal(nodeOnly.filter(x=>x.type==='resource').length,db.resources.length);
});

test('domains and flat nodes filter independently without duplicating shared nodes',async()=>{
 const {selectFeed,NODES,DOMAINS,nodeAvailable}=await import('../src/data.js');const db=createInitialState();
 const video=selectFeed(db,{view:'topics',domainId:'video'}),game=selectFeed(db,{view:'topics',domainId:'game'});
 assert.equal(video.length,6);assert.equal(game.length,2);
 assert.ok(video.every(x=>x.item.domainId==='video'));assert.ok(game.every(x=>x.item.domainId==='game'));
 assert.equal(selectFeed(db,{view:'topics'}).length,video.length+game.length);
 const qa=selectFeed(db,{view:'topics',nodeId:'qna'});
 assert.deepEqual(new Set(qa.map(x=>x.item.domainId)),new Set(['video','game']));
 assert.equal(NODES.filter(n=>n.id==='qna').length,1);
 assert.ok(DOMAINS.every(d=>nodeAvailable(d.id,'qna')));
 assert.equal(selectFeed(db,{view:'topics',domainId:'game',nodeId:'qna'}).length,1);
 assert.equal(selectFeed(db,{view:'topics',domainId:'game',nodeId:'editing'}).length,0);
 assert.equal(selectFeed(db,{domainId:'game'}).filter(x=>x.type==='resource').length,db.resources.filter(r=>r.domainIds.includes('game')).length);
});
test('available nodes share one identity and enforce domain-specific combinations',async()=>{
 const {availableNodes,nodeAvailable}=await import('../src/data.js');
 assert.ok(availableNodes('video').some(n=>n.id==='editing'));
 assert.ok(!availableNodes('game').some(n=>n.id==='editing'));
 assert.ok(availableNodes('game').some(n=>n.id==='gameplay'));
 assert.ok(nodeAvailable('video','qna')&&nodeAvailable('game','qna'));
 assert.ok(!nodeAvailable('game','editing')&&!nodeAvailable('all','qna'));
 assert.equal(availableNodes('video').find(n=>n.id==='qna'),availableNodes('game').find(n=>n.id==='qna'));
});

test('resources reuse one identity across domains without duplicating comments or feed rows',async()=>{
 const {selectFeed,resourceInScope}=await import('../src/data.js');const db=createInitialState(),r=db.resources.find(r=>r.id==='comfyui');
 const before=resourceSignals(db,r.id);
 for(const domainId of ['video','game']){
  assert.ok(resourceInScope(r,domainId));
  assert.equal(selectFeed(db,{view:'resources',domainId}).filter(x=>x.item.id===r.id).length,1);
 }
 assert.equal(selectFeed(db,{view:'resources'}).filter(x=>x.item.id===r.id).length,1);
 assert.deepEqual(resourceSignals(db,r.id),before);
});
test('tags are domain-scoped and each resource binding uses a valid pair',async()=>{
 const {availableTags,tagAvailable,resourceInScope}=await import('../src/data.js');const db=createInitialState(),r=db.resources.find(r=>r.id==='comfyui');
 assert.ok(availableTags('video').some(t=>t.id==='video-generation'));
 assert.ok(!availableTags('game').some(t=>t.id==='video-generation'));
 assert.ok(availableTags('game').some(t=>t.id==='game-engine'));
 assert.ok(tagAvailable('video','workflow')&&tagAvailable('game','workflow'));
 assert.ok(resourceInScope(r,'video','video-generation'));
 assert.ok(!resourceInScope(r,'game','video-generation'));
 assert.ok(!resourceTagIds(r,'game').includes('video-generation'));
 for(const item of db.resources){
  assert.ok(item.tagAssignments.every(a=>item.domainIds.includes(a.domainId)&&tagAvailable(a.domainId,a.tagId)));
  assert.equal(new Set(item.tagAssignments.map(a=>a.domainId+':'+a.tagId)).size,item.tagAssignments.length);
 }
});
test('new unclassified links remain visible in all domains without receiving a classification from references',async()=>{
 const {selectFeed}=await import('../src/data.js');const db=structuredClone(createInitialState());
 db.resources.push({id:'unclassified',status:'listed',metadataState:'loading',domainIds:[],tagAssignments:[]});
 db.topics.push({id:'mentions-new',domainId:'game',nodeId:'qna',refs:['unclassified']});
 assert.ok(selectFeed(db,{view:'resources'}).some(x=>x.item.id==='unclassified'));
 assert.ok(!selectFeed(db,{view:'resources',domainId:'game'}).some(x=>x.item.id==='unclassified'));
 assert.equal(resourceSignals(db,'unclassified').refs,1);
});
