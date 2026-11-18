import test from 'node:test';
import assert from 'node:assert/strict';
import {recordVisit,visibleVisits,dailyHotTopics} from '../src/sidebar-model.js';

test('revisiting moves one identity to the front and preserves distinct resource/topic identities',()=>{
 let h=recordVisit([], {kind:'topic',id:'a',domainId:'video'},1);
 h=recordVisit(h,{kind:'resource',id:'a',domainId:'video'},2);
 h=recordVisit(h,{kind:'topic',id:'b',domainId:'game'},3);
 h=recordVisit(h,{kind:'resource',id:'a',domainId:'game'},4,2);
 assert.deepEqual(h.map(v=>[v.kind,v.id,v.domainId]),[['resource','a','game'],['topic','b','game']]);
 assert.equal(h[0].viewedAt,4);
});

test('history stays cross-domain and excludes deleted and hidden targets',()=>{
 const db={topics:[{id:'a',status:'open',domainId:'video'},{id:'hidden',status:'hidden'}],resources:[{id:'r',status:'listed',domainIds:['game']}]};
 const history=[{kind:'topic',id:'a'},{kind:'resource',id:'r'},{kind:'topic',id:'hidden'},{kind:'resource',id:'deleted'}];
 assert.deepEqual(visibleVisits(db,history).map(v=>v.id),['a','r']);
});

test('daily hot counts today visible replies including old topics, excluding stale/future/hidden activity',()=>{
 const now=new Date(2026,10,17,12).getTime(),today=now-60000,yesterday=now-86400000;
 const db={topics:[{id:'old',status:'open',domainId:'video',createdAt:yesterday},{id:'new',status:'open',domainId:'video',createdAt:today},{id:'game',status:'open',domainId:'game',createdAt:today},{id:'hidden',status:'hidden',domainId:'video'}],replies:[
 {topicId:'old',createdAt:today},{topicId:'old',createdAt:today-1},
 {topicId:'new',createdAt:today},{topicId:'new',createdAt:yesterday},{topicId:'new',createdAt:today,hidden:true},{topicId:'new',createdAt:now+60000},{topicId:'new'},
 {topicId:'game',createdAt:today},{topicId:'hidden',createdAt:today}
 ]};
 assert.deepEqual(dailyHotTopics(db,{now,domainId:'video'}).map(x=>[x.topic.id,x.replies]),[['old',2],['new',1]]);
 assert.deepEqual(dailyHotTopics(db,{now,domainId:'game'}).map(x=>x.topic.id),['game']);
});

test('hot list observes local day boundary and never fills inactive topics',()=>{
 const now=new Date(2026,10,17,12).getTime(),start=new Date(2026,10,17).getTime();
 const db={topics:[{id:'boundary',status:'open',domainId:'video'},{id:'inactive',status:'open',domainId:'video'}],replies:[{topicId:'boundary',createdAt:start},{topicId:'boundary',createdAt:start-1}]};
 assert.equal(dailyHotTopics(db,{now})[0].replies,1);
 assert.equal(dailyHotTopics(db,{now}).length,1);
 assert.equal(dailyHotTopics(db,{now,domainId:'game'}).length,0);
});
