-- Each named statement is executed separately. Bind identities from the server session.
-- write: start_topic_follow
-- ?1 follow ID, ?2 user ID, ?3 topic ID
INSERT INTO topic_follows(id,user_id,topic_id,start_event_id)
SELECT ?1,u.id,t.id,(SELECT coalesce(max(id),0) FROM domain_events)
FROM users u JOIN topics t ON t.id=?3
WHERE u.id=?2 AND u.status='active' AND t.visibility='visible'
ON CONFLICT(user_id,topic_id) WHERE end_event_id IS NULL DO NOTHING;

-- write: end_topic_follow
-- ?1 user ID, ?2 topic ID
UPDATE topic_follows
SET end_event_id=(SELECT coalesce(max(id),0) FROM domain_events)
WHERE user_id=?1 AND topic_id=?2 AND end_event_id IS NULL;

-- write: consume_oauth_login_state
-- ?1 state hash, ?2 provider, ?3 browser binding hash
UPDATE oauth_login_states SET consumed_at=unixepoch()
WHERE state_hash=?1 AND provider=?2 AND browser_binding_hash=?3
 AND consumed_at IS NULL AND expires_at>unixepoch();
