export interface BotType {
  id: number;
  name: string;
  description: string;
  provider: string;
  api_url: string;
  llm_model: string;
  embedding_model: string;
  search_technique: string;
  chunk_size: number;
  chunk_overlap: number;
  system_prompt: string;
  temperature: number;
  top_k: number;
  vector_weight: number;
  keyword_weight: number;
  score_threshold: number;
  use_mmr: boolean;
  default_filters: RetrievalFilters;
  cite_sources: boolean;
}

export interface DocType {
  id: number;
  bot_id: number;
  name: string;
  source_type?: string;
  source_url?: string;
  tags?: string[];
  author?: string;
  chunks_count?: number;
  uploaded_at?: string;
  content?: string;
}

export interface TagFilter {
  values: string[];
  mode: "any" | "all";
}

export interface RetrievalFilters {
  doc_ids?: number[];
  exclude_doc_ids?: number[];
  source_type?: string;
  author?: string;
  tags?: TagFilter;
  date_range?: { from?: string; to?: string };
  page_range?: { from?: number; to?: number };
  custom?: Record<string, string>;
}

export interface SourceChunkType {
  content: string;
  metadata: {
    doc_name: string;
    doc_id: number;
    chunk_index: number;
    page_number?: number;
    section_heading?: string;
    tags?: string[];
    source_type?: string;
  };
  vec_score: number;
  kw_score: number;
  combined_score?: number;
}

export interface MetadataFacets {
  tags: { value: string; count: number }[];
  source_types: { value: string; count: number }[];
  authors: { value: string; count: number }[];
  documents: {
    doc_id: number;
    doc_name: string;
    source_type: string;
    tags: string[];
  }[];
}
