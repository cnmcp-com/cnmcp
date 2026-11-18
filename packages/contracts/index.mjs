export const API_PREFIX = '/api/v1';
export const resourceKinds = Object.freeze({ link: '链接', model: '模型', skill: '技能', tool: '工具', library: '开发库' });
export const reportReasons = Object.freeze({ inaccurate: '资料不准确', spam: '垃圾推广',
  off_topic: '不相关内容', sensitive: '敏感信息', other: '其他问题' });
export const memberTabs = Object.freeze({ bookmarks: '我的收藏', 'followed-topics': '关注主题', topics: '我的主题',
  replies: '我的回复', drafts: '草稿', discoveries: '我发现的资源' });
export function queryPath(path, params = {}) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value != null && value !== '' && value !== false) query.set(name, String(value));
  }
  return query.size ? path + '?' + query : path;
}
