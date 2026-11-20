-- v2.1 member-only read queries. Server binds identity, enum values and limits.
-- domain_id/node_id/tag_id NULL = unrestricted; no client-supplied user identity.
-- query: topic_list
WITH scoped AS (
 SELECT t.id,t.domain_id,t.node_id,t.author_id,t.title,t.body,t.progress_note,t.version,t.visibility,t.created_at,t.updated_at,t.last_activity_at,d.name AS domain_name,n.name AS node_name,coalesce(c.reply_count,0) AS reply_count,
 CASE WHEN :topic_sort='active' THEN t.last_activity_at ELSE t.created_at END AS sort_at
 FROM topics t JOIN domains d ON d.id=t.domain_id JOIN nodes n ON n.id=t.node_id
 LEFT JOIN v_topic_reply_counts c ON c.topic_id=t.id
 WHERE t.visibility='visible' AND d.status='active' AND n.status='active'
 AND (:domain_id IS NULL OR t.domain_id=:domain_id)
 AND (:node_id IS NULL OR t.node_id=:node_id)
 AND (:unanswered=0 OR coalesce(c.reply_count,0)=0)
)
SELECT * FROM scoped WHERE :cursor_time IS NULL OR sort_at<:cursor_time
 OR (sort_at=:cursor_time AND id<:cursor_id)
ORDER BY sort_at DESC,id DESC LIMIT :limit;

-- query: resource_discussions
SELECT t.id,t.title,t.domain_id,t.node_id,t.last_activity_at
FROM v_topic_resource_references rr JOIN topics t ON t.id=rr.topic_id
WHERE rr.resource_id=:resource_id
ORDER BY t.last_activity_at DESC,t.id DESC LIMIT :limit;

-- query: resource_list
SELECT r.id,r.name,r.summary,r.kind,r.created_at,s.stars,s.stars_observed_at,
 s.discussion_reference_count,s.comment_count,s.bookmark_count,s.helpful_count,s.stars_source_url
FROM resources r JOIN v_resource_signals s ON s.resource_id=r.id
WHERE (:domain_id IS NULL OR EXISTS (SELECT 1 FROM resource_domains rd JOIN domains d ON d.id=rd.domain_id
 WHERE rd.resource_id=r.id AND rd.domain_id=:domain_id AND d.status='active'))
 AND (:tag_id IS NULL OR EXISTS (SELECT 1 FROM resource_tags rt JOIN tags tg ON tg.id=rt.tag_id
 WHERE rt.resource_id=r.id AND rt.tag_id=:tag_id AND (:domain_id IS NULL OR rt.domain_id=:domain_id) AND tg.status='active'))
 AND (:resource_kind IS NULL OR r.kind=:resource_kind)
ORDER BY CASE WHEN :resource_sort='stars' AND s.stars IS NOT NULL THEN 1 ELSE 0 END DESC,
 CASE WHEN :resource_sort='stars' THEN s.stars END DESC,
 CASE WHEN :resource_sort='activity' THEN s.discussion_reference_count END DESC,
 CASE WHEN :resource_sort='activity' THEN s.comment_count END DESC,
 CASE WHEN :resource_sort='activity' THEN s.bookmark_count END DESC,
 CASE WHEN :resource_sort='activity' THEN s.helpful_count END DESC,
 r.created_at DESC,r.id DESC LIMIT :limit OFFSET :offset;

-- query: canonical_resource
SELECT r.id,r.name,r.visibility,src.id AS source_id,src.canonical_url
FROM resource_sources src JOIN resources r ON r.id=src.resource_id
WHERE src.canonical_key=:canonical_key;

-- query: search_topics
SELECT id,title,domain_id,node_id FROM topics
WHERE visibility='visible' AND (:domain_id IS NULL OR domain_id=:domain_id)
 AND (instr(lower(title),lower(:query))>0 OR instr(lower(body),lower(:query))>0)
ORDER BY created_at DESC,id DESC LIMIT :limit;

-- query: private_drafts
SELECT id,domain_id,node_id,editing_topic_id,title,body,updated_at FROM drafts
WHERE user_id=:user_id ORDER BY updated_at DESC,id DESC LIMIT :limit;

-- Overview is TWO independent collections, never one mixed UNION or shared facets.
-- query: overview_topics
SELECT t.id,t.title,t.domain_id,t.node_id,t.created_at,coalesce(c.reply_count,0) AS reply_count
FROM topics t JOIN domains d ON d.id=t.domain_id JOIN nodes n ON n.id=t.node_id
LEFT JOIN v_topic_reply_counts c ON c.topic_id=t.id
WHERE t.visibility='visible' AND d.status='active' AND n.status='active'
 AND (:domain_id IS NULL OR t.domain_id=:domain_id)
ORDER BY t.created_at DESC,t.id DESC LIMIT 6;

-- query: overview_resources
SELECT r.id,r.name,r.summary,r.kind,r.created_at
FROM resources r WHERE r.visibility='visible'
 AND (:domain_id IS NULL OR EXISTS (SELECT 1 FROM resource_domains rd JOIN domains d ON d.id=rd.domain_id
 WHERE rd.resource_id=r.id AND rd.domain_id=:domain_id AND d.status='active'))
ORDER BY r.created_at DESC,r.id DESC LIMIT 3;

-- UTC bounds computed by cnmcp-server for site timezone Asia/Shanghai.
-- query: today_hot
SELECT t.id,t.title,t.domain_id,t.node_id,count(tr.id) AS today_reply_count
FROM topic_replies tr JOIN topics t ON t.id=tr.topic_id
WHERE tr.visibility='visible' AND t.visibility='visible'
 AND tr.created_at>=:day_start AND tr.created_at<:day_end AND tr.created_at<=:now
 AND (:domain_id IS NULL OR t.domain_id=:domain_id)
GROUP BY t.id ORDER BY today_reply_count DESC,t.created_at DESC,t.id DESC LIMIT 5;

-- query: waiting_count
SELECT count(*) AS waiting_count FROM topics t
WHERE t.visibility='visible' AND (:domain_id IS NULL OR t.domain_id=:domain_id)
 AND NOT EXISTS (SELECT 1 FROM topic_replies tr WHERE tr.topic_id=t.id AND tr.visibility='visible');

-- query: member_card
SELECT u.id,u.handle,u.display_name,u.avatar_url,u.bio,u.theme_preference,
 (SELECT count(*) FROM bookmarks b WHERE b.user_id=u.id AND
   (EXISTS(SELECT 1 FROM topics t WHERE t.id=b.topic_id AND t.visibility='visible') OR
    EXISTS(SELECT 1 FROM resources r WHERE r.id=b.resource_id AND r.visibility='visible'))) AS bookmark_count,
 (SELECT count(*) FROM topic_follows f JOIN topics t ON t.id=f.topic_id WHERE f.user_id=u.id
   AND f.end_event_id IS NULL AND t.visibility='visible') AS followed_topic_count,
 (SELECT count(*) FROM topics t WHERE t.author_id=u.id AND t.visibility='visible') AS my_topic_count,
 (SELECT count(*) FROM notifications n JOIN v_public_domain_events e ON e.id=n.event_id
   WHERE n.recipient_id=u.id AND n.read_at IS NULL) AS unread_count
FROM users u WHERE u.id=:user_id AND u.status='active';

-- query: private_followed_topics
SELECT t.id,t.title,t.domain_id,t.node_id,f.created_at AS followed_at
FROM topic_follows f JOIN topics t ON t.id=f.topic_id
WHERE f.user_id=:user_id AND f.end_event_id IS NULL AND t.visibility='visible'
ORDER BY f.created_at DESC,f.id DESC LIMIT :limit;

-- query: private_notifications
SELECT n.id,n.reason,n.read_at,n.created_at,e.event_type,e.topic_id,e.topic_reply_id,e.resource_id,e.resource_comment_id
FROM notifications n JOIN v_public_domain_events e ON e.id=n.event_id
WHERE n.recipient_id=:user_id AND (:only_unread=0 OR n.read_at IS NULL)
ORDER BY n.created_at DESC,n.id DESC LIMIT :limit;

-- query: search_resources
SELECT r.id,r.name,r.summary,r.kind FROM resources r
WHERE r.visibility='visible' AND (:domain_id IS NULL OR EXISTS
 (SELECT 1 FROM resource_domains rd WHERE rd.resource_id=r.id AND rd.domain_id=:domain_id))
 AND (instr(lower(r.name),lower(:query))>0 OR instr(lower(r.summary),lower(:query))>0 OR EXISTS
 (SELECT 1 FROM resource_tags rt JOIN tags t ON t.id=rt.tag_id WHERE rt.resource_id=r.id
  AND (:domain_id IS NULL OR rt.domain_id=:domain_id) AND instr(lower(t.name),lower(:query))>0))
ORDER BY r.created_at DESC,r.id DESC LIMIT :limit;

-- query: private_bookmarks
SELECT b.id,b.topic_id,b.resource_id,t.title,r.name,b.created_at
FROM bookmarks b LEFT JOIN topics t ON t.id=b.topic_id LEFT JOIN resources r ON r.id=b.resource_id
WHERE b.user_id=:user_id AND (t.visibility='visible' OR r.visibility='visible')
ORDER BY b.created_at DESC,b.id DESC LIMIT :limit;

-- query: reply_notification_recipients
WITH reply_event AS (
 SELECT e.id AS event_id,t.id AS topic_id,t.author_id AS topic_author_id,
        coalesce(e.actor_id,tr.author_id) AS actor_id
 FROM v_public_domain_events e JOIN topic_replies tr ON tr.id=e.topic_reply_id
 JOIN topics t ON t.id=tr.topic_id
 WHERE e.id=:event_id AND e.event_type='reply_created'
), candidates AS (
 SELECT topic_author_id AS user_id,actor_id,'reply' AS reason FROM reply_event
 UNION
 SELECT f.user_id,e.actor_id,'follow'
 FROM reply_event e JOIN topic_follows f ON f.topic_id=e.topic_id
 WHERE f.user_id<>e.topic_author_id AND f.start_event_id<e.event_id
   AND (f.end_event_id IS NULL OR e.event_id<=f.end_event_id)
)
SELECT c.user_id AS recipient_id,c.reason
FROM candidates c JOIN users u ON u.id=c.user_id
WHERE u.status='active' AND c.user_id<>c.actor_id;
