"use client";

import React from "react";
import { Filter, X } from "lucide-react";
import type { MetadataFacets, RetrievalFilters } from "@/lib/types";

interface Props {
  filters: RetrievalFilters;
  facets: MetadataFacets | null;
  onChange: (filters: RetrievalFilters) => void;
  isDark: boolean;
}

export function MetadataFilterBar({ filters, facets, onChange, isDark }: Props) {
  const sInput = isDark
    ? "bg-slate-950 border-slate-800 text-white text-xs"
    : "bg-white border-slate-200 text-slate-800 text-xs";

  const toggleDoc = (docId: number) => {
    const current = filters.doc_ids || [];
    const next = current.includes(docId)
      ? current.filter((id) => id !== docId)
      : [...current, docId];
    onChange({ ...filters, doc_ids: next.length ? next : undefined });
  };

  const toggleTag = (tag: string) => {
    const current = filters.tags?.values || [];
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    onChange({
      ...filters,
      tags: next.length ? { values: next, mode: filters.tags?.mode || "any" } : undefined,
    });
  };

  const clearFilters = () => onChange({});

  const activeCount =
    (filters.doc_ids?.length || 0) +
    (filters.tags?.values?.length || 0) +
    (filters.source_type ? 1 : 0) +
    (filters.author ? 1 : 0);

  return (
    <div className={`px-4 py-3 border-b space-y-2 ${isDark ? "border-slate-900 bg-slate-900/30" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          <Filter className="w-3 h-3" /> Metadata Filters
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">{activeCount} active</span>
          )}
        </span>
        {activeCount > 0 && (
          <button onClick={clearFilters} className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {facets?.documents?.map((doc) => {
          const active = filters.doc_ids?.includes(doc.doc_id);
          return (
            <button
              key={doc.doc_id}
              onClick={() => toggleDoc(doc.doc_id)}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                active
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : isDark
                    ? "border-slate-700 text-slate-400 hover:border-indigo-500/50"
                    : "border-slate-200 text-slate-600 hover:border-indigo-400"
              }`}
            >
              {doc.doc_name}
            </button>
          );
        })}

        {facets?.tags?.map((t) => {
          const active = filters.tags?.values?.includes(t.value);
          return (
            <button
              key={t.value}
              onClick={() => toggleTag(t.value)}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                active
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : isDark
                    ? "border-slate-700 text-slate-400 hover:border-emerald-500/50"
                    : "border-slate-200 text-slate-600 hover:border-emerald-400"
              }`}
            >
              #{t.value} ({t.count})
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 flex-wrap">
        <select
          value={filters.source_type || ""}
          onChange={(e) => onChange({ ...filters, source_type: e.target.value || undefined })}
          className={`rounded-lg px-2 py-1 border ${sInput}`}
        >
          <option value="">All source types</option>
          {facets?.source_types?.map((st) => (
            <option key={st.value} value={st.value}>{st.value} ({st.count})</option>
          ))}
        </select>

        <select
          value={filters.tags?.mode || "any"}
          onChange={(e) =>
            onChange({
              ...filters,
              tags: filters.tags?.values?.length
                ? { values: filters.tags.values, mode: e.target.value as "any" | "all" }
                : filters.tags,
            })
          }
          className={`rounded-lg px-2 py-1 border ${sInput}`}
        >
          <option value="any">Match any tag</option>
          <option value="all">Match all tags</option>
        </select>
      </div>
    </div>
  );
}
