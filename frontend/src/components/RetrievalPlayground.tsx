"use client";

import React, { useState } from "react";
import { Search, Loader } from "lucide-react";
import { API_BASE } from "@/lib/api";
import type { BotType, RetrievalFilters, SourceChunkType } from "@/lib/types";

interface Props {
  bot: BotType;
  filters: RetrievalFilters;
  isDark: boolean;
}

export function RetrievalPlayground({ bot, filters, isDark }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SourceChunkType[]>([]);
  const [loading, setLoading] = useState(false);

  const sCard = isDark ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200";
  const sInput = isDark
    ? "bg-slate-950 border-slate-800 text-white"
    : "bg-white border-slate-200 text-slate-800";

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/bots/${bot.id}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), filters }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-800"}`}>Retrieval Playground</h3>
        <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Test queries without invoking the LLM. Shows scores and chunk previews.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Test retrieval query..."
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm border ${sInput}`}
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"
        >
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Retrieve
        </button>
      </form>

      <div className="space-y-3">
        {results.map((r, i) => (
          <div key={i} className={`p-4 rounded-xl border ${sCard}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-indigo-500">#{i + 1} {r.metadata?.doc_name}</span>
              <div className="flex gap-2 text-[9px] font-mono">
                <span className="text-cyan-400">vec: {(r.vec_score ?? 0).toFixed(3)}</span>
                <span className="text-amber-400">kw: {(r.kw_score ?? 0).toFixed(3)}</span>
                <span className="text-emerald-400">combined: {(r.combined_score ?? 0).toFixed(3)}</span>
              </div>
            </div>
            <p className={`text-xs leading-relaxed max-h-32 overflow-y-auto ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              {r.content}
            </p>
          </div>
        ))}
        {results.length === 0 && !loading && (
          <p className={`text-xs text-center py-8 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            Run a query to preview retrieved chunks.
          </p>
        )}
      </div>
    </div>
  );
}
