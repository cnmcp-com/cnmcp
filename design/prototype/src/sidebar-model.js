import { initialTopics, initialReplies } from './data.js';

// Existing fixtures use ordering numbers and relative ages, not Unix timestamps.
// Anchor only those known demo fixtures once per preview session; never infer dates for user content.
const demoNow = Date.now();
const demoTopicTimes = new Map(initialTopics.map(t => {
  const age = t.age?.match(/(\d+)\s*(分钟|小时)/);
  return [t.id, demoNow - (age ? Number(age[1]) * (age[2] === '小时' ? 3600000 : 60000) : 0)];
}));
const demoReplyIds = new Set(initialReplies.map(r => r.id));
const isEpoch = n => Number.isFinite(n) && n > 1000000000000;

export function recordVisit(history = [], visit, now = Date.now(), limit = 20) {
  if (!['topic', 'resource'].includes(visit?.kind) || !visit.id) return history;
  return [{kind: visit.kind, id: visit.id, domainId: visit.domainId || 'all', viewedAt: now},
    ...history.filter(v => v.kind !== visit.kind || v.id !== visit.id)].slice(0, limit);
}

export function visibleVisits(db, history = []) {
  return history.flatMap(v => {
    const item = (v.kind === 'topic' ? db.topics : v.kind === 'resource' ? db.resources : []).find(x => x.id === v.id);
    if (!item || item.status === 'hidden') return [];
    return [{...v, item}];
  });
}

export function dailyHotTopics(db, {domainId = 'all', now = Date.now(), limit = 5} = {}) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const today = n => isEpoch(n) && n >= +start && n < +end && n <= now;
  return db.topics.filter(t => t.status !== 'hidden' && (domainId === 'all' || t.domainId === domainId))
    .map(topic => {
      const replies = db.replies.filter(r => r.topicId === topic.id && !r.hidden && today(
        isEpoch(r.createdAt) ? r.createdAt : demoReplyIds.has(r.id) && demoTopicTimes.has(topic.id) ? demoNow : null));
      return {topic, replies: replies.length};
    }).filter(x => x.replies > 0)
    .sort((a, b) => b.replies - a.replies || (isEpoch(b.topic.createdAt) ? b.topic.createdAt : demoTopicTimes.get(b.topic.id) || 0) - (isEpoch(a.topic.createdAt) ? a.topic.createdAt : demoTopicTimes.get(a.topic.id) || 0))
    .slice(0, limit);
}

export function visitAge(time, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}
