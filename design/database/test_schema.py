"""Behavioral schema tests against a clean in-memory SQLite database; no network or production writes."""
import pathlib
import sqlite3
import unittest

HERE = pathlib.Path(__file__).resolve().parent

class SchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript((HERE/'schema.sql').read_text())
        self.db.executescript((HERE/'seed.sql').read_text())
        self.db.execute("INSERT INTO users(id,handle,display_name) VALUES ('u','tester','测试用户')")
        self.topic('t1'); self.topic('t2'); self.resource('r1'); self.resource('r2')
    def tearDown(self):
        self.db.close()
    def topic(self, key, node='qna', body='', domain='video'):
        self.db.execute('INSERT INTO topics(id,domain_id,node_id,author_id,title,body) VALUES (?,?,?,?,?,?)',(key,domain,node,'u','一个测试主题',body))
    def resource(self,key,domain='video'):
        self.db.execute('INSERT INTO resources(id,slug,name) VALUES (?,?,?)',(key,key,key))
        if domain:self.db.execute('INSERT INTO resource_domains(resource_id,domain_id) VALUES (?,?)',(key,domain))
    def reply(self,key,topic='t1',quote=None):
        self.db.execute('INSERT INTO topic_replies(id,topic_id,author_id,body,quote_reply_id) VALUES (?,?,?,?,?)',(key,topic,'u','开放式回复',quote))
    def comment(self,key,resource='r1',quote=None):
        self.db.execute('INSERT INTO resource_comments(id,resource_id,author_id,body,quote_comment_id) VALUES (?,?,?,?,?)',(key,resource,'u','资源使用反馈',quote))
    def ref(self,key,resource='r1',**source):
        fields=['id','resource_id',*source];values=[key,resource,*source.values()]
        self.db.execute('INSERT INTO resource_references('+','.join(fields)+') VALUES ('+','.join('?' for _ in fields)+')',values)
    def signal(self,resource='r1'):
        self.db.row_factory=sqlite3.Row
        return dict(self.db.execute('SELECT * FROM v_resource_signals WHERE resource_id=?',(resource,)).fetchone())
    def rejects(self,sql,args=()):
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute(sql,args)

    def query(self,name):
        text=(HERE/'queries.sql').read_text().split('-- query: '+name+'\n',1)[1]
        return text.split('-- query:',1)[0]

    def write(self, name, args):
        text = (HERE/'writes.sql').read_text().split('-- write: '+name+'\n', 1)[1]
        return self.db.execute(text.split('-- write:', 1)[0], args)

    def test_login_identities_belong_to_the_same_site_account(self):
        self.db.execute("INSERT INTO users(id,handle,display_name) VALUES ('u2','tester2','第二用户')")
        insert = 'INSERT INTO user_identities(provider,provider_subject,user_id) VALUES (?,?,?)'
        self.db.executemany(insert, [('github','123','u'), ('google','123','u')])
        self.rejects(insert, ('GitHub','123','u2'))
        self.rejects(insert, ('google','456','missing'))
        self.rejects(insert, ('google','','u'))
        self.assertEqual(self.db.execute(
            'SELECT provider FROM user_identities WHERE user_id=? ORDER BY provider', ('u',)
        ).fetchall(), [('github',), ('google',)])

    def test_title_only_topic_is_valid_and_node_is_required(self):
        self.assertEqual(self.db.execute("SELECT body FROM topics WHERE id='t1'").fetchone()[0],'')
        self.rejects("INSERT INTO topics(id,domain_id,node_id,author_id,title) VALUES ('bad','video','missing','u','一个测试主题')")
        self.rejects("UPDATE topics SET title='短' WHERE id='t1'")
    def test_flat_nodes_are_unique_and_shared_by_configured_domains(self):
        columns={r[1] for r in self.db.execute('PRAGMA table_info(nodes)')}
        self.assertNotIn('parent_id',columns)
        self.assertEqual(self.db.execute("SELECT count(*) FROM nodes WHERE id='qna'").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM domain_nodes WHERE node_id='qna'").fetchone()[0],2)
        self.topic('game-qna',domain='game')
        self.rejects("INSERT INTO nodes(id,slug,name) VALUES ('dupe','dupe','问与答')")
        self.rejects("INSERT INTO domain_nodes(domain_id,node_id) VALUES ('game','qna')")
    def test_topic_requires_a_configured_domain_node_pair(self):
        self.topic('video-edit','editing')
        self.rejects("INSERT INTO topics(id,domain_id,node_id,author_id,title) VALUES ('bad','game','editing','u','错误领域组合')")
        self.rejects("UPDATE topics SET domain_id='game' WHERE id='video-edit'")
        self.rejects("UPDATE topics SET domain_id=NULL WHERE id='t1'")
        self.rejects("UPDATE topics SET node_id=NULL WHERE id='t1'")
        self.rejects("DELETE FROM domain_nodes WHERE domain_id='video' AND node_id='qna'")
    def test_draft_keeps_optional_selection_but_rejects_invalid_pair(self):
        self.db.execute("INSERT INTO drafts(id,user_id,title) VALUES ('d','u','未选分类的草稿')")
        self.db.execute("UPDATE drafts SET domain_id='game' WHERE id='d'")
        self.rejects("UPDATE drafts SET domain_id='missing' WHERE id='d'")
        self.db.execute("UPDATE drafts SET domain_id='game',node_id='qna' WHERE id='d'")
        self.rejects("UPDATE drafts SET node_id='editing' WHERE id='d'")
        self.rejects("UPDATE drafts SET domain_id=NULL WHERE id='d'")
    def test_quote_stays_in_its_original_discussion(self):
        self.reply('a'); self.reply('b',quote='a')
        self.rejects("INSERT INTO topic_replies(id,topic_id,author_id,body,quote_reply_id) VALUES ('c','t2','u','测试回复','a')")
        self.comment('ca')
        self.rejects("INSERT INTO resource_comments(id,resource_id,author_id,body,quote_comment_id) VALUES ('cb','r2','u','使用反馈','ca')")
    def test_reference_has_one_real_source_and_cannot_duplicate(self):
        self.ref('a',topic_id='t1')
        with self.assertRaises(sqlite3.IntegrityError):self.ref('b',topic_id='t1')
        with self.assertRaises(sqlite3.IntegrityError):self.ref('c')
        self.reply('reply')
        with self.assertRaises(sqlite3.IntegrityError):self.ref('d',topic_id='t1',topic_reply_id='reply')
    def test_discussion_dedup_and_independent_comment_counts(self):
        self.ref('a',topic_id='t1');self.reply('reply');self.ref('b',topic_reply_id='reply')
        self.assertEqual(self.signal()['discussion_reference_count'],1)
        self.assertEqual(self.signal()['comment_count'],0)
        self.comment('comment');self.assertEqual(self.signal()['comment_count'],1)
        self.assertEqual(self.db.execute("SELECT reply_count FROM v_topic_reply_counts WHERE topic_id='t1'").fetchone()[0],1)
        self.ref('c',topic_id='t2');self.assertEqual(self.signal()['discussion_reference_count'],2)
    def test_comment_can_discover_resource_without_becoming_topic_reply(self):
        self.comment('comment');self.ref('a',resource='r2',resource_comment_id='comment')
        self.assertEqual(self.signal('r2')['discussion_reference_count'],0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM topic_replies').fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM resource_references').fetchone()[0],1)
    def test_visibility_changes_recalculate_without_losing_resource(self):
        self.reply('reply');self.ref('a',topic_reply_id='reply');self.comment('comment')
        self.db.execute("UPDATE topic_replies SET visibility='hidden' WHERE id='reply'")
        self.assertEqual(self.signal()['discussion_reference_count'],0)
        self.assertEqual(self.signal()['comment_count'],1)
        self.db.execute("UPDATE topic_replies SET visibility='visible' WHERE id='reply'")
        self.assertEqual(self.signal()['discussion_reference_count'],1)
        self.db.execute("UPDATE topics SET visibility='hidden' WHERE id='t1'")
        self.assertEqual(self.signal()['discussion_reference_count'],0)
    def test_metadata_jobs_never_gate_visibility_or_null_stars(self):
        self.db.execute("INSERT INTO resource_sources(id,resource_id,provider,canonical_key,canonical_url) VALUES ('s','r1','github','github:a/b','https://github.com/a/b')")
        self.db.execute("INSERT INTO metadata_jobs(source_id) VALUES ('s')")
        self.rejects("INSERT INTO metadata_jobs(source_id) VALUES ('s')")
        self.rejects("INSERT INTO metadata_jobs(source_id) VALUES ('missing')")
        self.assertIsNone(self.signal()['stars'])
        self.assertIsNone(self.signal()['stars_observed_at'])
        self.rejects("UPDATE resource_sources SET stars=12 WHERE id='s'")
        self.rejects("UPDATE resource_sources SET stars_observed_at=123 WHERE id='s'")
        self.rejects("UPDATE resource_sources SET stars=-1,stars_observed_at=123 WHERE id='s'")
        self.rejects("UPDATE resource_sources SET stars=0,stars_observed_at='invalid' WHERE id='s'")
        self.db.execute("UPDATE resource_sources SET stars=0,stars_observed_at=123 WHERE id='s'")
        self.db.execute("UPDATE metadata_jobs SET state='retry',last_error='timeout' WHERE source_id='s'")
        self.assertEqual(self.signal()['resource_id'],'r1')
        self.assertEqual(self.signal()['stars'],0)
        self.assertEqual(self.signal()['stars_observed_at'],123)
        self.assertIsNone(self.signal('r2')['stars_source_url'])

    def test_sources_own_unique_repository_identity_and_stars(self):
        self.db.execute("INSERT INTO resource_sources(id,resource_id,provider,canonical_key,canonical_url) VALUES ('s','r1','web','https://example.com/a','https://example.com/a')")
        self.rejects("INSERT INTO resource_sources(id,resource_id,provider,canonical_key,canonical_url) VALUES ('dup','r2','web','https://example.com/a','https://example.com/a')")
        self.rejects("UPDATE resource_sources SET stars=0,stars_observed_at=123 WHERE id='s'")
        self.db.execute("INSERT INTO resource_sources(id,resource_id,provider,canonical_key,canonical_url,external_id) VALUES ('g','r1','github','github:a/b','https://github.com/a/b','42')")
        self.rejects("INSERT INTO resource_sources(id,resource_id,provider,canonical_key,canonical_url,external_id) VALUES ('dup','r2','github','github:a/c','https://github.com/a/c','42')")

    def test_resource_stars_pick_one_github_source_deterministically(self):
        self.db.execute("""
            INSERT INTO resource_sources(id,resource_id,provider,canonical_key,canonical_url,is_primary,stars,stars_observed_at,created_at) VALUES
              ('w','r1','web','https://example.com','https://example.com',1,NULL,NULL,1),
              ('g2','r1','github','github:a/b','https://github.com/a/b',0,200,30,20),
              ('g1','r1','github','github:a/a','https://github.com/a/a',0,100,30,20),
              ('g3','r2','github','github:a/c','https://github.com/a/c',0,NULL,NULL,20)
        """)
        self.assertEqual(self.signal()['stars_source_url'], 'https://github.com/a/a')
        self.db.execute("UPDATE resource_sources SET is_primary=0 WHERE id='w'")
        self.db.execute("UPDATE resource_sources SET is_primary=1 WHERE id='g2'")
        rows = self.db.execute(self.query('resource_list'), dict(
            domain_id=None, tag_id=None, resource_kind=None, resource_sort='stars', limit=20, offset=0
        )).fetchall()
        self.assertEqual([(r[0], r[5], r[-1]) for r in rows], [
            ('r1', 200, 'https://github.com/a/b'), ('r2', None, 'https://github.com/a/c'),
        ])
    def test_interactions_are_unique_and_reversible(self):
        self.db.execute("INSERT INTO bookmarks(id,user_id,resource_id) VALUES ('b','u','r1')")
        self.rejects("INSERT INTO bookmarks(id,user_id,resource_id) VALUES ('b2','u','r1')")
        self.rejects("INSERT INTO bookmarks(id,user_id,topic_id,resource_id) VALUES ('b3','u','t1','r1')")
        self.assertEqual(self.signal()['bookmark_count'],1)
        self.db.execute("DELETE FROM bookmarks WHERE id='b'");self.assertEqual(self.signal()['bookmark_count'],0)
        self.comment('c');self.db.execute("INSERT INTO helpful_votes(id,user_id,resource_comment_id) VALUES ('h','u','c')")
        self.rejects("INSERT INTO helpful_votes(id,user_id,resource_comment_id) VALUES ('h2','u','c')")
    def test_events_are_typed_and_idempotent(self):
        self.db.execute("INSERT INTO domain_events(dedupe_key,event_type,topic_id) VALUES ('e','topic_created','t1')")
        self.rejects("INSERT INTO domain_events(dedupe_key,event_type,topic_id) VALUES ('e','topic_created','t1')")
        self.rejects("INSERT INTO domain_events(dedupe_key,event_type,resource_id) VALUES ('wrong','reply_created','r1')")
        self.db.execute("INSERT INTO notifications(id,recipient_id,event_id,reason) VALUES ('n','u',1,'follow')")
        self.rejects("INSERT INTO notifications(id,recipient_id,event_id,reason) VALUES ('n2','u',1,'follow')")
    def test_resource_has_multiple_unique_real_tags(self):
        self.db.execute("INSERT INTO resource_tags VALUES ('r1','video','python')")
        self.db.execute("INSERT INTO resource_tags VALUES ('r1','video','local')")
        self.assertEqual(self.db.execute("SELECT count(*) FROM resource_tags WHERE resource_id='r1'").fetchone()[0],2)
        self.rejects("INSERT INTO resource_tags VALUES ('r1','video','python')")
        self.rejects("INSERT INTO resource_tags VALUES ('r1','video','missing')")
        self.assertEqual(self.signal('r2')['resource_id'],'r2')
    def test_tags_and_references_do_not_change_topic_node(self):
        self.ref('ref',topic_id='t1');self.reply('reply')
        self.db.execute("INSERT INTO resource_tags VALUES ('r1','video','python')")
        self.db.execute("DELETE FROM resource_tags WHERE resource_id='r1'")
        self.assertEqual(self.db.execute("SELECT node_id FROM topics WHERE id='t1'").fetchone()[0],'qna')
        self.assertEqual(self.signal()['discussion_reference_count'],1)
        self.assertEqual(self.db.execute("SELECT reply_count FROM v_topic_reply_counts WHERE topic_id='t1'").fetchone()[0],1)
        columns={r[1] for r in self.db.execute('PRAGMA table_info(topics)')}
        self.assertTrue('node_id' in columns and not {'kind','tags','tag_id'} & columns)
    def test_overview_has_two_bounded_domain_only_collections(self):
        for i in range(7):self.topic('extra-'+str(i),'solution-requests')
        self.resource('r3');self.resource('r4');self.topic('game',domain='game')
        topics=self.db.execute(self.query('overview_topics'),dict(domain_id='video')).fetchall()
        resources=self.db.execute(self.query('overview_resources'),dict(domain_id='video')).fetchall()
        self.assertEqual(len(topics),6);self.assertEqual(len(resources),3)
        self.assertTrue(all(r[2]=='video' for r in topics))
        self.assertEqual([r[0] for r in self.db.execute(self.query('overview_topics'),dict(domain_id='game'))],['game'])
        self.assertNotIn(':node_id',self.query('overview_topics'));self.assertNotIn(':tag_id',self.query('overview_resources'))
    def test_domain_and_node_queries_are_independent(self):
        self.topic('game-topic',domain='game');self.topic('video-edit','editing')
        query=self.query('topic_list')
        params=dict(domain_id='video',node_id=None,cursor_time=None,cursor_id=None,limit=20,topic_sort='new',unanswered=0)
        video={r[0] for r in self.db.execute(query,params)}
        self.assertEqual(video,{'t1','t2','video-edit'})
        game={r[0] for r in self.db.execute(query,{**params,'domain_id':'game'})}
        self.assertEqual(game,{'game-topic'})
        qa={r[0] for r in self.db.execute(query,{**params,'domain_id':None,'node_id':'qna'})}
        self.assertEqual(qa,{'t1','t2','game-topic'})
        impossible=self.db.execute(query,{**params,'domain_id':'game','node_id':'editing'}).fetchall()
        self.assertEqual(impossible,[])
    def test_topic_follows_are_idempotent_and_allow_refollow_at_same_watermark(self):
        self.assertEqual(self.write('start_topic_follow', ('f1','u','t1')).rowcount, 1)
        self.assertEqual(self.write('start_topic_follow', ('dup','u','t1')).rowcount, 0)
        self.assertEqual(self.write('start_topic_follow', ('bad','u','missing')).rowcount, 0)
        self.assertEqual(self.write('end_topic_follow', ('u','t1')).rowcount, 1)
        self.assertEqual(self.write('end_topic_follow', ('u','t1')).rowcount, 0)
        self.assertEqual(self.write('start_topic_follow', ('f2','u','t1')).rowcount, 1)
        self.assertEqual(self.db.execute(
            'SELECT start_event_id,end_event_id FROM topic_follows ORDER BY id'
        ).fetchall(), [(0,0), (0,None)])
        self.rejects("UPDATE topic_follows SET end_event_id=-1 WHERE id='f2'")
        params = dict(user_id='u', limit=10)
        self.assertEqual([row[0] for row in self.db.execute(self.query('private_followed_topics'), params)], ['t1'])

    def test_reply_notification_uses_follow_at_event_time(self):
        self.db.executemany('INSERT INTO users(id,handle,display_name) VALUES (?,?,?)', [
            ('follower','follower','关注者'), ('reply-author','reply-author','回复者'),
        ])

        def reply_event(reply_id):
            self.db.execute("""
                INSERT INTO topic_replies(id,topic_id,author_id,body) VALUES (?,'t1','reply-author','一条测试回复')
            """, (reply_id,))
            return self.db.execute("""
                INSERT INTO domain_events(dedupe_key,event_type,topic_reply_id) VALUES (?,'reply_created',?)
            """, (reply_id,reply_id)).lastrowid

        old_event = reply_event('old')
        self.write('start_topic_follow', ('f1','follower','t1'))
        self.write('start_topic_follow', ('f2','u','t1'))
        self.write('start_topic_follow', ('f3','reply-author','t1'))
        followed_event = reply_event('followed')
        self.write('end_topic_follow', ('follower','t1'))
        gap_event = reply_event('gap')
        self.write('start_topic_follow', ('f4','follower','t1'))
        refollowed_event = reply_event('refollowed')

        def recipients(event_id):
            return sorted(self.db.execute(self.query('reply_notification_recipients'), dict(event_id=event_id)))

        self.assertEqual(recipients(old_event), [('u','reply')])
        self.assertEqual(recipients(followed_event), [('follower','follow'), ('u','reply')])
        self.assertEqual(recipients(gap_event), [('u','reply')])
        self.assertEqual(recipients(refollowed_event), [('follower','follow'), ('u','reply')])
        self.db.execute("UPDATE topic_replies SET visibility='hidden' WHERE id='refollowed'")
        self.assertEqual(recipients(refollowed_event), [])
    def resource_query(self,domain=None,tag=None):
        return self.db.execute(self.query('resource_list'),dict(domain_id=domain,tag_id=tag,limit=30,resource_sort='activity',resource_kind=None,offset=0)).fetchall()
    def test_resource_domains_and_tags_enforce_both_pairs(self):
        self.db.execute("INSERT INTO resource_domains VALUES ('r1','game')")
        self.db.execute("INSERT INTO resource_tags VALUES ('r1','game','workflow')")
        self.rejects("INSERT INTO resource_tags VALUES ('r1','game','video-generation')")
        self.rejects("INSERT INTO resource_tags VALUES ('r2','game','workflow')")
        self.rejects("INSERT INTO domain_tags(domain_id,tag_id) VALUES ('game','workflow')")
        self.rejects("INSERT INTO resource_tags VALUES ('r1','game','workflow')")
        self.assertEqual([r[0] for r in self.resource_query('game','workflow')],['r1'])
        self.assertEqual(self.resource_query('game','video-generation'),[])
    def test_cross_domain_resource_identity_and_signals_are_not_duplicated(self):
        self.db.execute("INSERT INTO resource_domains VALUES ('r1','game')")
        self.comment('c');self.ref('ref',topic_id='t1')
        video=[r for r in self.resource_query('video') if r[0]=='r1']
        game=[r for r in self.resource_query('game') if r[0]=='r1']
        self.assertEqual(len(video),1);self.assertEqual(video,game)
        self.assertEqual(len(self.resource_query()),2)
        self.assertEqual(self.signal()['comment_count'],1)
        self.assertEqual(self.signal()['discussion_reference_count'],1)
    def test_removing_a_resource_domain_preserves_other_bindings_and_content(self):
        self.db.execute("INSERT INTO resource_domains VALUES ('r1','game')")
        self.db.execute("INSERT INTO resource_tags VALUES ('r1','game','workflow')")
        self.db.execute("INSERT INTO resource_tags VALUES ('r1','video','workflow')")
        self.comment('c');self.ref('ref',topic_id='t1')
        self.rejects("DELETE FROM resource_domains WHERE resource_id='r1' AND domain_id='game'")
        self.db.execute("DELETE FROM resource_tags WHERE resource_id='r1' AND domain_id='game'")
        self.db.execute("DELETE FROM resource_domains WHERE resource_id='r1' AND domain_id='game'")
        self.assertEqual(self.db.execute("SELECT domain_id FROM resource_tags WHERE resource_id='r1'").fetchone()[0],'video')
        self.assertEqual(self.signal()['comment_count'],1)
        self.assertEqual(self.signal()['discussion_reference_count'],1)
    def test_unclassified_resources_are_visible_in_all_but_not_specific_domains(self):
        self.resource('new',None)
        self.assertIn('new',[r[0] for r in self.resource_query()])
        self.assertNotIn('new',[r[0] for r in self.resource_query('video')])
        self.assertNotIn('new',[r[0] for r in self.resource_query('game')])
    def test_query_examples_execute_with_bound_parameters(self):
        bindings=dict(domain_id=None,tag_id=None,node_id=None,cursor_time=None,cursor_id=None,topic_sort='new',resource_sort='activity',resource_kind=None,offset=0,unanswered=0,only_unread=0,day_start=0,day_end=2100000000,now=2000000000,limit=20,resource_id='r1',canonical_key='missing',query='测试',user_id='u',event_id=1)
        statement=''
        for line in (HERE/'queries.sql').read_text().splitlines(keepends=True):
            statement+=line
            if sqlite3.complete_statement(statement):
                self.db.execute(statement,bindings).fetchall();statement=''
        self.assertFalse(statement.strip())
    def test_feedback_is_member_submission_without_operator_workflow(self):
        self.db.execute("INSERT INTO reports(id,reporter_id,resource_id,reason) VALUES ('r','u','r1','inaccurate')")
        self.rejects("INSERT INTO reports(id,reporter_id,reason) VALUES ('missing','u','spam')")
        self.assertNotIn('handled_by',{r[1] for r in self.db.execute('PRAGMA table_info(reports)')})
        self.assertNotIn('role',{r[1] for r in self.db.execute('PRAGMA table_info(users)')})
        self.assertIsNone(self.db.execute("SELECT name FROM sqlite_master WHERE name='moderation_actions'").fetchone())
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_login_state_is_bound_single_use_and_rejects_external_return(self):
        state='a'*64;browser='b'*64
        self.db.execute("INSERT INTO oauth_login_states(state_hash,provider,browser_binding_hash,expires_at) VALUES (?,'github',?,unixepoch()+300)",(state,browser))
        self.assertEqual(self.write('consume_oauth_login_state', (state,'google',browser)).rowcount,0)
        self.assertEqual(self.write('consume_oauth_login_state', (state,'github','c'*64)).rowcount,0)
        self.assertEqual(self.write('consume_oauth_login_state', (state,'github',browser)).rowcount,1)
        self.assertEqual(self.write('consume_oauth_login_state', (state,'github',browser)).rowcount,0)
        self.rejects("INSERT INTO oauth_login_states(state_hash,provider,browser_binding_hash,return_path,expires_at) VALUES (?,'github',?,'//evil.example',unixepoch()+300)",('d'*64,browser))

    def test_write_idempotency_is_unique_per_member_and_scope(self):
        self.db.execute("INSERT INTO users(id,handle,display_name) VALUES ('u2','tester2','第二用户')")
        # JSON literal is bound below to avoid quoting user text into SQL.
        insert="INSERT INTO idempotency_keys(user_id,scope,request_key,request_hash,response_status,response_json,expires_at) VALUES (?,'topic.create',?,?,201,?,unixepoch()+86400)"
        args=('u','k'*16,'a'*64,'{"id":"t1"}')
        self.db.execute(insert,args);self.rejects(insert,args)
        self.db.execute(insert,('u2',*args[1:]))
        self.rejects(insert,('u','x'*16,'a'*64,'bad json'))

    def test_notifications_deduplicate_reasons_and_hide_inaccessible_targets(self):
        self.reply('reply');self.db.execute("INSERT INTO domain_events(dedupe_key,event_type,topic_reply_id) VALUES ('reply-event','reply_created','reply')")
        self.db.execute("INSERT INTO notifications(id,recipient_id,event_id,reason) VALUES ('n','u',1,'reply')")
        self.rejects("INSERT INTO notifications(id,recipient_id,event_id,reason) VALUES ('dup','u',1,'follow')")
        params=dict(user_id='u',only_unread=0,limit=20)
        self.assertEqual(len(self.db.execute(self.query('private_notifications'),params).fetchall()),1)
        self.assertEqual(len(self.db.execute(self.query('private_notifications'),{**params,'user_id':'other'}).fetchall()),0)
        self.db.execute("UPDATE topics SET visibility='hidden' WHERE id='t1'")
        self.assertEqual(len(self.db.execute(self.query('private_notifications'),params).fetchall()),0)
        self.assertEqual(self.db.execute(self.query('member_card'),dict(user_id='u')).fetchone()[-1],0)

    def test_today_hot_uses_reply_day_not_topic_creation_or_all_time_count(self):
        start,now,end=1999996400,2000000000,2000003600
        self.db.execute("UPDATE topics SET created_at=? WHERE id='t1'",(start-86400,))
        for key in ['a','b','yesterday','future','hidden']:self.reply(key)
        for key,stamp in [('a',start),('b',now),('yesterday',start-1),('future',now+1),('hidden',now)]:
            self.db.execute('UPDATE topic_replies SET created_at=? WHERE id=?',(stamp,key))
        self.db.execute("UPDATE topic_replies SET visibility='hidden' WHERE id='hidden'")
        params=dict(domain_id='video',day_start=start,day_end=end,now=now)
        rows=self.db.execute(self.query('today_hot'),params).fetchall()
        self.assertEqual([(r[0],r[-1]) for r in rows],[('t1',2)])
        self.assertEqual(self.db.execute(self.query('today_hot'),{**params,'domain_id':'game'}).fetchall(),[])
        self.db.execute("UPDATE topics SET visibility='hidden' WHERE id='t1'")
        self.assertEqual(self.db.execute(self.query('today_hot'),params).fetchall(),[])

    def test_member_card_counts_only_own_visible_relations(self):
        self.db.execute("INSERT INTO bookmarks(id,user_id,topic_id) VALUES ('b','u','t1')")
        self.write('start_topic_follow', ('f1','u','t1'))
        self.db.row_factory=sqlite3.Row
        card=dict(self.db.execute(self.query('member_card'),dict(user_id='u')).fetchone())
        self.assertEqual(card['bookmark_count'],1);self.assertEqual(card['followed_topic_count'],1);self.assertEqual(card['my_topic_count'],2)
        self.db.execute("UPDATE topics SET visibility='hidden' WHERE id='t1'")
        card=dict(self.db.execute(self.query('member_card'),dict(user_id='u')).fetchone())
        self.assertEqual(card['bookmark_count'],0);self.assertEqual(card['followed_topic_count'],0);self.assertEqual(card['my_topic_count'],1)

    def test_comment_topic_reference_is_not_a_resource_adoption_or_reply(self):
        self.comment('c');self.db.execute("UPDATE resource_comments SET referenced_topic_id='t1' WHERE id='c'")
        self.assertEqual(self.signal()['discussion_reference_count'],0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM topic_replies').fetchone()[0],0)
        self.rejects("UPDATE resource_comments SET referenced_topic_id='missing' WHERE id='c'")

    def test_edit_version_guard_rolls_back_the_entire_write(self):
        self.db.commit()
        guard="INSERT INTO idempotency_keys(user_id,scope,request_key,request_hash,response_status,response_json,expires_at) VALUES ('u','topic.update',?,?,CASE WHEN (SELECT last_write_key FROM topics WHERE id='t1')=? THEN 200 ELSE 0 END,?,unixepoch()+86400)"
        def edit(expected,nonce,key,conflict=False):
            with self.db:
                self.db.execute("UPDATE topics SET body=?,version=version+1,last_write_key=? WHERE id='t1' AND author_id='u' AND version=?",(nonce,nonce,expected))
                self.db.execute(guard,(key,'a'*64,nonce,'{"id":"t1"}'))
                self.db.execute("DELETE FROM resource_references WHERE topic_id='t1'")
                self.ref('ref-'+nonce,topic_id='t1')
                if conflict:self.db.execute("INSERT INTO resource_sources(id,resource_id,provider,canonical_key,canonical_url) VALUES ('duplicate','r2','web','same','https://example.com/')")
        edit(1,'first','a'*16)
        with self.assertRaises(sqlite3.IntegrityError):edit(1,'stale','b'*16)
        self.assertEqual(self.db.execute("SELECT body,version,last_write_key FROM topics WHERE id='t1'").fetchone(),('first',2,'first'))
        self.assertEqual(self.db.execute("SELECT id FROM resource_references WHERE topic_id='t1'").fetchone()[0],'ref-first')
        self.db.execute("INSERT INTO resource_sources(id,resource_id,provider,canonical_key,canonical_url) VALUES ('original','r1','web','same','https://example.com/')");self.db.commit()
        with self.assertRaises(sqlite3.IntegrityError):edit(2,'conflict','c'*16,True)
        self.assertEqual(self.db.execute("SELECT body,version,last_write_key FROM topics WHERE id='t1'").fetchone(),('first',2,'first'))
        self.assertEqual(self.db.execute("SELECT count(*) FROM idempotency_keys").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT id FROM resource_references WHERE topic_id='t1'").fetchone()[0],'ref-first')

    def test_outbox_processing_requires_a_recoverable_lease(self):
        self.db.execute("INSERT INTO domain_events(dedupe_key,event_type,topic_id) VALUES ('e','topic_created','t1')")
        self.rejects("UPDATE domain_events SET notification_state='processing' WHERE id=1")
        self.db.execute("UPDATE domain_events SET notification_state='processing',notification_lease_until=unixepoch()+60 WHERE id=1")
        self.db.execute("UPDATE domain_events SET notification_state='pending',notification_lease_until=NULL WHERE id=1")

if __name__=='__main__':unittest.main(verbosity=2)
