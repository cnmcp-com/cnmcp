export const API_PREFIX: '/api/v1';
export type ResourceKind = 'link' | 'model' | 'skill' | 'tool' | 'library';
export type ReportReason = 'inaccurate' | 'spam' | 'off_topic' | 'sensitive' | 'other';
export type MemberTab = 'bookmarks' | 'followed-topics' | 'topics' | 'replies' | 'drafts' | 'discoveries';
export const resourceKinds: Readonly<Record<ResourceKind, string>>;
export const reportReasons: Readonly<Record<ReportReason, string>>;
export const memberTabs: Readonly<Record<MemberTab, string>>;
export function queryPath(path: string, params?: Record<string, string | boolean | number | null | undefined>): string;

export interface ApiError {
  error: { code: string; message: string; requestId: string; fieldErrors?: Record<string, string> }
}
export interface TaxonomyItem { id: string; slug: string; name: string; description: string; sort_order: number }
export interface Taxonomy {
  domains: TaxonomyItem[];
  nodes: TaxonomyItem[];
  tags: TaxonomyItem[];
  domain_nodes: { domain_id: string; node_id: string; sort_order: number }[];
  domain_tags: { domain_id: string; tag_id: string; sort_order: number }[];
}
export interface Topic {
  id: string; title: string; body: string; progress_note: string; version: number; author_id: string; author: string; managed_author?: 0 | 1;
  domain_id: string; node_id: string; created_at: number; updated_at: number; last_activity_at: number;
  reply_count: number; resource_count: number;
}
export interface Resource {
  id: string; name: string; summary: string; kind: ResourceKind; created_at: number; updated_at: number;
  created_by?: string | null; author?: string | null; managed_author?: 0 | 1;
  domain_ids: string[]; tags: { domain_id: string; tag_id: string; name: string }[];
  stars: number | null; stars_observed_at: number | null; stars_source_url: string | null;
  code_license: string | null; weights_license: string | null;
  discussion_reference_count: number; comment_count: number; bookmark_count: number; helpful_count: number;
}
export interface DiscussionEntry {
  id: string; body: string; author_id: string; author: string; managed_author?: 0 | 1; created_at: number; helpful_count: number;
  quote_reply_id?: string | null; quote_comment_id?: string | null; referenced_topic_id?: string | null;
}
export interface ResourceSource {
  provider: 'github' | 'huggingface' | 'web' | 'community'; canonical_url: string; metadata_updated_at: number | null;
  stars: number | null; stars_observed_at: number | null;
  metadata: { curatedBy?: string; curatedUrl?: string; curatedIssue?: number; description?: string; language?: string; archived?: boolean };
}
export interface TopicDetail extends Topic { replies: DiscussionEntry[]; resources: Resource[]; nextPage: number | null }
export interface ResourceDetail extends Resource { comments: DiscussionEntry[]; sources: ResourceSource[]; nextPage: number | null }
export interface Overview { recentTopics: Topic[]; recentResources: Resource[] }
export interface TopicList { items: Topic[]; nextCursor: string | null }
export interface ResourceList { items: Resource[]; nextPage: number | null }
export interface TopicInput { title: string; body: string; domainId: string; nodeId: string; progressNote?: string; draftId?: string }
export interface EditTopicInput extends Partial<TopicInput> { expectedVersion: number }
export interface DiscussionInput { body: string; quoteId?: string; referencedTopicId?: string }
