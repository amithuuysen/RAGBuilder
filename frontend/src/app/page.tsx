"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Layers,
  Plus,
  Bot,
  MessageSquare,
  UploadCloud,
  FileText,
  Trash2,
  Code,
  X,
  RefreshCw,
  Check,
  AlertTriangle,
  Send,
  Loader,
  Settings,
  Database,
  Sliders,
  History,
  Activity,
  Terminal,
  Cpu,
  HardDrive
} from "lucide-react";

const API_BASE = "http://localhost:8000";

interface BotType {
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
}

interface DocType {
  id: number;
  bot_id: number;
  name: string;
  content: string;
}

interface SourceChunkType {
  content: string;
  metadata: {
    doc_name: string;
    doc_id: number;
    chunk_index: number;
  };
  vec_score: number;
  kw_score: number;
}

interface MessageType {
  sender: "user" | "bot";
  text: string;
  error?: boolean;
}

interface SessionType {
  id: number;
  bot_id: number;
  name: string;
  created_at: string;
}

interface SystemStatsType {
  cpu_percent: number;
  ram_percent: number;
  ram_total_mb: number;
  ram_used_mb: number;
  disk_percent: number;
  db_size_kb: number;
  qdrant_size_kb: number;
  bots_count: number;
  docs_count: number;
  sessions_count: number;
  
  // New process metrics
  process_rss_mb: number;
  process_mem_percent: number;
  process_uptime_seconds: number;
  process_threads: number;
  process_fds: number;
  process_connections: number;
  process_vms_mb: number;
  pid: number;
}

// ----------------------------------------------------
// UI Helpers for Neon & 3D Dashboard Effects
// ----------------------------------------------------
function Sparkline({ data, color, width = 120, height = 28 }: { data: number[], color: string, width?: number, height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible opacity-80">
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace("#", "")})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BigChart({ data, color, label, currentValue, unit, isDark }: { data: number[], color: string, label: string, currentValue: string | number, unit: string, isDark: boolean }) {
  const width = 600;
  const height = 150;
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
  
  if (data.length === 0) {
    return (
      <div className={`flex-1 h-[150px] flex items-center justify-center text-xs font-mono rounded-2xl border ${
        isDark ? "bg-slate-900/30 border-slate-850 text-slate-500" : "bg-white border-slate-200 text-slate-400"
      }`}>
        Waiting for telemetry data...
      </div>
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1 || 1)) * width;
    const y = height - ((val - min) / range) * (height - 24) - 12;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const lastPoint = points[points.length - 1];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const index = Math.round(pct * (data.length - 1));
    const activeIndex = Math.max(0, Math.min(data.length - 1, index));
    setHoveredIdx(activeIndex);
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
  };

  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : null;
  const tooltipLeft = activePoint ? `${(activePoint.x / width) * 100}%` : "0%";
  const tooltipTop = activePoint ? `${(activePoint.y / height) * 100}%` : "0%";
  const hoveredValue = hoveredIdx !== null ? data[hoveredIdx] : null;
  const timeOffsetSec = hoveredIdx !== null ? (data.length - 1 - hoveredIdx) * -3 : 0;

  return (
    <div className={`relative flex-1 p-5 rounded-2xl border transition-all duration-300 ${
      isDark 
        ? "bg-slate-900/40 border-slate-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03),0_10px_20px_rgba(0,0,0,0.3)]" 
        : "bg-white border-slate-200 shadow-sm shadow-slate-100"
    }`}
      style={{
        boxShadow: isDark 
          ? `0 0 25px -8px ${color}20, inset 0 1px 1px rgba(255,255,255,0.03)` 
          : `0 4px 20px -5px rgba(0,0,0,0.04), 0 0 15px -5px ${color}15`
      }}
    >
      <div className="flex justify-between items-center mb-4">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          {label}
        </span>
        <span className="text-xs font-mono font-bold" style={{ color }}>
          {currentValue} {unit}
        </span>
      </div>
      
      <div className="h-[130px] w-full relative">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          width="100%" 
          height="100%" 
          preserveAspectRatio="none" 
          className="overflow-visible cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id={`big-grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#big-grad-${color.replace("#", "")})`} />
          <path d={linePath} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          
          {/* Active hover vertical line and point */}
          {activePoint && (
            <>
              <line x1={activePoint.x} y1={0} x2={activePoint.x} y2={height} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
              <circle cx={activePoint.x} cy={activePoint.y} r={5} fill={color} />
              <circle cx={activePoint.x} cy={activePoint.y} r={10} fill="none" stroke={color} strokeWidth={1} className="animate-pulse" style={{ transformOrigin: `${activePoint.x}px ${activePoint.y}px` }} />
            </>
          )}

          {lastPoint && !activePoint && (
            <>
              <circle cx={lastPoint.x} cy={lastPoint.y} r={5} fill={color} />
              <circle cx={lastPoint.x} cy={lastPoint.y} r={10} fill="none" stroke={color} strokeWidth={1.5} className="animate-ping" style={{ transformOrigin: `${lastPoint.x}px ${lastPoint.y}px` }} />
            </>
          )}
        </svg>

        {hoveredIdx !== null && activePoint && hoveredValue !== null && (
          <div 
            className="absolute z-10 p-2.5 rounded-xl border pointer-events-none transition-all duration-75 text-center font-mono backdrop-blur-md"
            style={{
              left: tooltipLeft,
              top: `calc(${tooltipTop} - 65px)`,
              transform: "translateX(-50%)",
              backgroundColor: isDark ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.95)",
              borderColor: isDark ? "rgba(51, 65, 85, 0.8)" : "rgba(226, 232, 240, 0.8)",
              boxShadow: `0 8px 16px -4px rgba(0,0,0,0.15), 0 0 10px -2px ${color}30`
            }}
          >
            <div className="text-xs font-black" style={{ color }}>
              {hoveredValue.toFixed(1)}{unit === "%" ? "%" : ` ${unit}`}
            </div>
            <div className={`text-[9px] mt-0.5 font-bold ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              {timeOffsetSec === 0 ? "now" : `${timeOffsetSec}s`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (!seconds) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function Home() {
  const [bots, setBots] = useState<BotType[]>([]);
  const [activeBot, setActiveBot] = useState<BotType | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "documents" | "settings" | "system">("chat");

  // Create Bot Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newBotName, setNewBotName] = useState("");
  const [newBotDesc, setNewBotDesc] = useState("");
  const [newBotProvider, setNewBotProvider] = useState("ollama");
  const [newBotUrl, setNewBotUrl] = useState("http://localhost:11434");
  const [newBotLlm, setNewBotLlm] = useState("");
  const [newBotLlmSelect, setNewBotLlmSelect] = useState("");
  const [newBotEmbed, setNewBotEmbed] = useState("");
  const [newBotEmbedSelect, setNewBotEmbedSelect] = useState("");
  const [newBotStrategy, setNewBotStrategy] = useState("vector");
  const [newBotTemp, setNewBotTemp] = useState(0.2);

  // Edit Settings State
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTechnique, setEditTechnique] = useState("vector");
  const [editLlm, setEditLlm] = useState("");
  const [editSystemPrompt, setEditSystemPrompt] = useState("");
  const [editTemp, setEditTemp] = useState(0.2);

  // Connection & Model Detection State
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [detectionStatus, setDetectionStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [detectionMsg, setDetectionMsg] = useState("");

  // Documents State
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Chat Sessions & Message History
  const [sessions, setSessions] = useState<SessionType[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<MessageType[]>([]);
  const [retrievedSources, setRetrievedSources] = useState<SourceChunkType[]>([]);
  const [isChatGenerating, setIsChatGenerating] = useState(false);

  // Monitoring & Logs State
  const [systemStats, setSystemStats] = useState<SystemStatsType | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logFilterLevel, setLogFilterLevel] = useState<string>("");
  const [logLinesCount, setLogLinesCount] = useState<number>(100);
  const logTerminalEndRef = useRef<HTMLDivElement | null>(null);

  // Redesign custom states
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memoryRssHistory, setMemoryRssHistory] = useState<number[]>([]);
  const [memoryPercentHistory, setMemoryPercentHistory] = useState<number[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [autoscroll, setAutoscroll] = useState(true);
  const [logsPaused, setLogsPaused] = useState(false);
  const [wrapLogs, setWrapLogs] = useState(false);

  // Load initial bots list
  useEffect(() => {
    fetchBots();
  }, []);

  // Poll system stats and logs when 'system' tab is active
  useEffect(() => {
    if (activeTab !== "system") return;

    fetchSystemStats();
    fetchSystemLogs();

    const interval = setInterval(() => {
      fetchSystemStats();
      fetchSystemLogs();
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTab, logLinesCount, logsPaused]);

  // Scroll terminal to bottom when logs update
  useEffect(() => {
    if (activeTab === "system" && autoscroll) {
      logTerminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, activeTab, autoscroll]);

  const fetchBots = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bots`);
      if (res.ok) {
        const data = await res.json();
        setBots(data);
      }
    } catch (err) {
      console.error("Failed to load bots:", err);
    }
  };

  const fetchSystemStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/system/stats`);
      if (res.ok) {
        const data = await res.json();
        setSystemStats(data);
        
        // Accumulate last 30 data points
        setCpuHistory((prev) => {
          const next = [...prev, data.cpu_percent];
          return next.slice(-30);
        });
        setMemoryRssHistory((prev) => {
          const next = [...prev, data.process_rss_mb || 0];
          return next.slice(-30);
        });
        setMemoryPercentHistory((prev) => {
          const next = [...prev, data.process_mem_percent || 0];
          return next.slice(-30);
        });
      }
    } catch (err) {
      console.error("Failed to fetch system stats:", err);
    }
  };

  const fetchSystemLogs = async () => {
    if (logsPaused) return;
    try {
      // Fetch a larger buffer so client-side filters have enough logs to display
      const res = await fetch(`${API_BASE}/api/system/logs?lines=200`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/system/logs/clear`, {
        method: "POST"
      });
      if (res.ok) {
        setLogs([]);
      }
    } catch (err) {
      console.error("Failed to clear logs:", err);
    }
  };

  const handleDownloadLogs = () => {
    const blob = new Blob([logs.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ragbuilder.log";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectBot = async (bot: BotType) => {
    setActiveBot(bot);
    setChatMessages([]);
    setRetrievedSources([]);
    setActiveTab("chat");
    setActiveSessionId(null);
    setSessions([]);

    // Populate Edit forms
    setEditName(bot.name);
    setEditDesc(bot.description || "");
    setEditTechnique(bot.search_technique);
    setEditLlm(bot.llm_model);
    setEditSystemPrompt(bot.system_prompt || "");
    setEditTemp(bot.temperature !== undefined ? bot.temperature : 0.2);

    // Load documents & sessions
    fetchDocuments(bot.id);
    fetchSessions(bot.id, true);
  };

  const fetchDocuments = async (botId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/bots/${botId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    }
  };

  const fetchSessions = async (botId: number, autoSelectFirst = false) => {
    try {
      const res = await fetch(`${API_BASE}/api/bots/${botId}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (autoSelectFirst && data.length > 0) {
          handleSelectSession(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  };

  const handleCreateSession = async () => {
    if (!activeBot) return;
    try {
      const res = await fetch(`${API_BASE}/api/bots/${activeBot.id}/sessions`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        await fetchSessions(activeBot.id, false);
        handleSelectSession(data.session_id);
      }
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const handleSelectSession = async (sessionId: number) => {
    if (!activeBot) return;
    setActiveSessionId(sessionId);
    setChatMessages([]);
    setRetrievedSources([]);
    
    try {
      const res = await fetch(`${API_BASE}/api/bots/${activeBot.id}/sessions/${sessionId}/messages`);
      if (res.ok) {
        const data = await res.json();
        const mapped = data.map((m: any) => ({
          sender: m.sender as "user" | "bot",
          text: m.text
        }));
        setChatMessages(mapped);
      }
    } catch (err) {
      console.error("Failed to load session messages:", err);
    }
  };

  const handleDeleteSession = async (sessionId: number) => {
    if (!activeBot) return;

    try {
      const res = await fetch(`${API_BASE}/api/bots/${activeBot.id}/sessions/${sessionId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setSessionToDelete(null);
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
          setChatMessages([]);
          setRetrievedSources([]);
          fetchSessions(activeBot.id, true);
        } else {
          fetchSessions(activeBot.id, false);
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  // Provider trigger to update default URL
  useEffect(() => {
    if (newBotProvider === "ollama") {
      setNewBotUrl("http://localhost:11434");
    } else {
      setNewBotUrl("http://localhost:1234");
    }
  }, [newBotProvider]);

  // Model connection check & detection
  const handleTestConnection = async () => {
    setDetectionStatus("loading");
    setDetectionMsg("Detecting active models...");
    setDetectedModels([]);

    try {
      const res = await fetch(`${API_BASE}/api/providers/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: newBotProvider, api_url: newBotUrl })
      });
      const data = await res.json();

      if (data.success && data.models.length > 0) {
        setDetectionStatus("success");
        setDetectionMsg(`Connected successfully! Found ${data.models.length} models.`);
        setDetectedModels(data.models);
        setNewBotLlmSelect(data.models[0]);
        setNewBotEmbedSelect(data.models[0]);
      } else {
        setDetectionStatus("error");
        setDetectionMsg(data.message || "No models returned from local provider.");
      }
    } catch (err) {
      setDetectionStatus("error");
      setDetectionMsg("Failed to connect. Check if local provider service is active.");
    }
  };

  // Bot creation
  const handleCreateBot = async () => {
    const finalLlm = newBotLlm || newBotLlmSelect;
    const finalEmbed = newBotEmbed || newBotEmbedSelect;

    if (!newBotName || !finalLlm) {
      alert("Please specify a Name and Chat Model.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/bots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBotName,
          description: newBotDesc,
          provider: newBotProvider,
          api_url: newBotUrl,
          llm_model: finalLlm,
          embedding_model: finalEmbed,
          search_technique: newBotStrategy,
          chunk_size: 500,
          chunk_overlap: 50,
          system_prompt: "You are a helpful assistant.",
          temperature: newBotTemp
        })
      });

      if (res.ok) {
        const data = await res.json();
        setNewBotName("");
        setNewBotDesc("");
        setNewBotLlm("");
        setNewBotEmbed("");
        setIsCreateModalOpen(false);
        setDetectionStatus("idle");
        
        await fetchBots();
        const detailRes = await fetch(`${API_BASE}/api/bots/${data.id}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          handleSelectBot(detail);
        }
      } else {
        const err = await res.json();
        alert(err.detail || "Error creating bot.");
      }
    } catch (err) {
      alert("Server connection failed.");
    }
  };

  // Bot save updates
  const handleSaveSettings = async () => {
    if (!activeBot) return;

    try {
      const res = await fetch(`${API_BASE}/api/bots/${activeBot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDesc,
          provider: activeBot.provider,
          api_url: activeBot.api_url,
          llm_model: editLlm,
          embedding_model: activeBot.embedding_model,
          search_technique: editTechnique,
          chunk_size: activeBot.chunk_size,
          chunk_overlap: activeBot.chunk_overlap,
          system_prompt: editSystemPrompt,
          temperature: editTemp
        })
      });

      if (res.ok) {
        alert("Settings updated successfully!");
        await fetchBots();
        const detailRes = await fetch(`${API_BASE}/api/bots/${activeBot.id}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          setActiveBot(detail);
        }
      } else {
        alert("Failed to update settings.");
      }
    } catch (err) {
      alert("Connection failure.");
    }
  };

  // Bot deletion
  const handleDeleteBot = async () => {
    if (!activeBot) return;
    if (!confirm("Are you sure you want to delete this bot and all its documents? This cannot be undone.")) return;

    try {
      const res = await fetch(`${API_BASE}/api/bots/${activeBot.id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setActiveBot(null);
        await fetchBots();
      }
    } catch (err) {
      alert("Error deleting bot.");
    }
  };

  // File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeBot || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);

    try {
      const res = await fetch(`${API_BASE}/api/bots/${activeBot.id}/documents`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        e.target.value = "";
        await fetchDocuments(activeBot.id);
      } else {
        const err = await res.json();
        alert(err.detail || "Error uploading document.");
      }
    } catch (err) {
      alert("Upload connection error.");
    } finally {
      setIsUploading(false);
    }
  };

  // Document delete
  const handleDeleteDoc = async (docId: number) => {
    if (!activeBot) return;
    if (!confirm("Delete this document and all its text embeddings?")) return;

    try {
      const res = await fetch(`${API_BASE}/api/bots/${activeBot.id}/documents/${docId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await fetchDocuments(activeBot.id);
      }
    } catch (err) {
      alert("Failed to delete document.");
    }
  };

  // Chat queries with SSE Streaming
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBot || !chatInput.trim()) return;

    const queryText = chatInput.trim();
    setChatInput("");

    // Append User Message and AI Placeholder to UI instantly
    setChatMessages((prev) => [
      ...prev,
      { sender: "user", text: queryText },
      { sender: "bot", text: "" }
    ]);
    setIsChatGenerating(true);

    try {
      const res = await fetch(`${API_BASE}/api/bots/${activeBot.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText, session_id: activeSessionId })
      });

      if (!res.ok) {
        const err = await res.json();
        setChatMessages((prev) => {
          const next = [...prev];
          if (next.length > 0) {
            next[next.length - 1] = { sender: "bot", text: err.detail || "Streaming query failed.", error: true };
          }
          return next;
        });
        setIsChatGenerating(false);
        return;
      }

      if (!res.body) {
        setChatMessages((prev) => {
          const next = [...prev];
          if (next.length > 0) {
            next[next.length - 1] = { sender: "bot", text: "Empty response body returned.", error: true };
          }
          return next;
        });
        setIsChatGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let botResponseText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;

          const lines = part.split("\n");
          let event = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.substring(7);
            else if (line.startsWith("data: ")) data = line.substring(6);
          }

          if (event === "metadata") {
            const meta = JSON.parse(data);
            if (meta.session_id) {
              setActiveSessionId(meta.session_id);
              fetchSessions(activeBot.id, false);
            }
            if (meta.context) {
              setRetrievedSources(meta.context);
            }
          } else if (event === "token") {
            const token = JSON.parse(data);
            botResponseText += token;
            
            setChatMessages((prev) => {
              const next = [...prev];
              if (next.length > 0) {
                next[next.length - 1].text = botResponseText;
              }
              return next;
            });
          } else if (event === "error") {
            const errMsg = JSON.parse(data);
            setChatMessages((prev) => {
              const next = [...prev];
              if (next.length > 0) {
                next[next.length - 1].text = errMsg;
                next[next.length - 1].error = true;
              }
              return next;
            });
          }
        }
      }
    } catch (err) {
      setChatMessages((prev) => {
        const next = [...prev];
        if (next.length > 0) {
          next[next.length - 1] = { sender: "bot", text: "Network streaming connection error.", error: true };
        }
        return next;
      });
    } finally {
      setIsChatGenerating(false);
    }
  };

  const getApiEndpoint = () => {
    if (!activeBot) return "";
    return `${API_BASE}/api/bots/${activeBot.id}/query`;
  };

  const getCurlSnippet = () => {
    if (!activeBot) return "";
    return `curl -X POST "${getApiEndpoint()}" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "Enter your prompt here"}'`;
  };

  const isDark = theme === "dark";

  // Modern 3D Neon Theme Classes
  const sBg = isDark ? "bg-[#090b10] text-slate-100" : "bg-slate-50 text-slate-900";
  const sSidebar = isDark ? "bg-slate-900 border-r border-slate-800" : "bg-white border-r border-slate-200 shadow-lg shadow-slate-100/50";
  const sCard = isDark ? "bg-slate-900/40 border-slate-850 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)]" : "bg-white border-slate-200/80 shadow-sm shadow-slate-200/40";
  const sBorder = isDark ? "border-slate-800" : "border-slate-200";
  const sTextMuted = isDark ? "text-slate-400" : "text-slate-500";
  const sTextTitle = isDark ? "text-white font-bold" : "text-slate-800 font-bold";

  return (
    <div className={`flex-1 flex overflow-hidden font-sans h-screen transition-all duration-300 ${sBg}`}>
      
      {/* Sidebar */}
      <aside className={`w-80 flex flex-col justify-between shrink-0 transition-all duration-300 ${sSidebar}`}>
        <div>
          {/* Logo Header */}
          <div className={`p-6 border-b flex items-center justify-between transition-all duration-300 ${sBorder}`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className={`text-xl font-bold tracking-tight ${isDark ? "bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent" : "text-slate-800"}`}>RAGBuilder</h1>
                <span className="text-[10px] text-indigo-400 font-semibold tracking-widest uppercase">Local Engine</span>
              </div>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={`p-2 rounded-xl transition-all duration-200 ${
                isDark 
                  ? "bg-slate-850 hover:bg-slate-800 text-amber-400 border border-slate-700" 
                  : "bg-slate-100 hover:bg-slate-200 text-indigo-600 border border-slate-200 shadow-sm"
              }`}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDark ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>

          {/* Bot list */}
          <div className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className={`text-xs font-semibold uppercase tracking-wider ${sTextMuted}`}>My Bots</span>
              <button 
                onClick={() => setIsCreateModalOpen(true)}
                className="p-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white transition-all duration-200"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
              {bots.length === 0 ? (
                <div className={`text-center p-6 text-xs ${sTextMuted}`}>
                  No bots found. Click + to add one.
                </div>
              ) : (
                bots.map((bot) => (
                  <button
                    key={bot.id}
                    onClick={() => handleSelectBot(bot)}
                    className={`w-full text-left p-3.5 rounded-xl flex items-center gap-3 transition-all duration-200 ${
                      activeBot && activeBot.id === bot.id && activeTab !== "system"
                        ? "bg-gradient-to-r from-indigo-600 to-indigo-700/80 border border-indigo-500/30 text-white shadow-lg shadow-indigo-500/10"
                        : isDark
                          ? "hover:bg-slate-850 border border-transparent text-slate-350"
                          : "hover:bg-slate-100 border border-transparent text-slate-750"
                    }`}
                  >
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all duration-200 ${
                      activeBot && activeBot.id === bot.id && activeTab !== "system" 
                        ? "bg-white/20 text-white" 
                        : isDark 
                          ? "bg-slate-800 text-indigo-400 border border-slate-700" 
                          : "bg-slate-50 text-indigo-500 border border-slate-200"
                    }`}>
                      <Bot className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${
                        activeBot && activeBot.id === bot.id && activeTab !== "system" 
                          ? "text-white" 
                          : isDark 
                            ? "text-slate-200" 
                            : "text-slate-800"
                      }`}>{bot.name}</p>
                      <p className={`text-[10px] truncate ${
                        activeBot && activeBot.id === bot.id && activeTab !== "system"
                          ? "text-white/70"
                          : "text-slate-500"
                      }`}>{bot.llm_model}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* System Dashboard Button & Status */}
        <div className={`p-4 border-t bg-slate-950/40 space-y-2.5 transition-all duration-300 ${sBorder}`}>
          <button 
            onClick={() => { setActiveTab("system"); setActiveBot(null); }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 ${
              activeTab === "system" 
                ? "bg-indigo-600/10 border-indigo-500/35 text-indigo-450 dark:text-indigo-300" 
                : isDark
                  ? "bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-350"
                  : "bg-white border-slate-200 hover:bg-slate-50 text-slate-750 shadow-sm"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span className="text-xs font-semibold">System Monitoring</span>
          </button>
          
          <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 ${
            isDark ? "bg-slate-900 border-slate-850" : "bg-white border-slate-200 shadow-sm"
          }`}>
            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></div>
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Local Services Active</p>
              <p className={`text-[9px] truncate ${sTextMuted}`}>Ollama & LM Studio ready</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full">
        {activeTab === "system" ? (
          /* System Status & Live Logs Dashboard */
          <div className={`flex-1 flex flex-col h-full overflow-hidden ${isDark ? "bg-[#090b10]" : "bg-slate-50"}`}>
            {/* Header */}
            <div className={`px-8 py-5 border-b flex items-center justify-between shrink-0 ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
              <div className="flex items-center gap-3">
                <Activity className="w-7 h-7 text-indigo-500 animate-pulse" />
                <div>
                  <h2 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>System Telemetry Dashboard</h2>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Monitor RAG engine resources, process metrics, and stream console logs in real time.</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { fetchSystemStats(); fetchSystemLogs(); }}
                  className={`p-2.5 rounded-xl border transition-all ${isDark ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm"}`}
                  title="Force Refresh Data"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Main scrollable body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Row 1: 8 Glowing Neon Metrics Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                
                {/* 1. CPU */}
                <div 
                  className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between ${
                    isDark ? "bg-slate-900/40 border-cyan-500/20 shadow-[0_0_20px_-8px_rgba(6,182,212,0.15)]" : "bg-white border-slate-200 shadow-sm shadow-slate-100"
                  }`}
                  style={{ boxShadow: isDark ? "0 0 20px -8px rgba(6,182,212,0.15), inset 0 1px 1px rgba(255,255,255,0.03)" : "" }}
                >
                  <div>
                    <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-wider block">CPU</span>
                    <span className={`text-2xl font-black font-mono tracking-tight block ${isDark ? "text-white" : "text-slate-800"}`}>
                      {systemStats?.cpu_percent.toFixed(1) ?? "0.0"} <span className="text-xs font-normal text-slate-500">%</span>
                    </span>
                  </div>
                  <div className="shrink-0 pl-2">
                    <Sparkline data={cpuHistory.length > 1 ? cpuHistory : [0, 0]} color="#06b6d4" />
                  </div>
                </div>

                {/* 2. Memory - RSS */}
                <div 
                  className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between ${
                    isDark ? "bg-slate-900/40 border-purple-500/20 shadow-[0_0_20px_-8px_rgba(168,85,247,0.15)]" : "bg-white border-slate-200 shadow-sm shadow-slate-100"
                  }`}
                  style={{ boxShadow: isDark ? "0 0 20px -8px rgba(168,85,247,0.15), inset 0 1px 1px rgba(255,255,255,0.03)" : "" }}
                >
                  <div>
                    <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider block">MEMORY - RSS</span>
                    <span className={`text-2xl font-black font-mono tracking-tight block ${isDark ? "text-white" : "text-slate-800"}`}>
                      {systemStats?.process_rss_mb.toFixed(0) ?? "0"} <span className="text-xs font-normal text-slate-500">MB</span>
                    </span>
                  </div>
                  <div className="shrink-0 pl-2">
                    <Sparkline data={memoryRssHistory.length > 1 ? memoryRssHistory : [0, 0]} color="#a855f7" />
                  </div>
                </div>

                {/* 3. Memory % */}
                <div 
                  className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between ${
                    isDark ? "bg-slate-900/40 border-pink-500/20 shadow-[0_0_20px_-8px_rgba(236,72,153,0.15)]" : "bg-white border-slate-200 shadow-sm shadow-slate-100"
                  }`}
                  style={{ boxShadow: isDark ? "0 0 20px -8px rgba(236,72,153,0.15), inset 0 1px 1px rgba(255,255,255,0.03)" : "" }}
                >
                  <div>
                    <span className="text-[10px] font-bold text-pink-500 uppercase tracking-wider block">MEM %</span>
                    <span className={`text-2xl font-black font-mono tracking-tight block ${isDark ? "text-white" : "text-slate-800"}`}>
                      {systemStats?.process_mem_percent.toFixed(1) ?? "0.0"} <span className="text-xs font-normal text-slate-500">%</span>
                    </span>
                  </div>
                  <div className="shrink-0 pl-2">
                    <Sparkline data={memoryPercentHistory.length > 1 ? memoryPercentHistory : [0, 0]} color="#ec4899" />
                  </div>
                </div>

                {/* 4. Uptime */}
                <div 
                  className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
                    isDark ? "bg-slate-900/40 border-blue-500/20 shadow-[0_0_20px_-8px_rgba(59,130,246,0.15)]" : "bg-white border-slate-200 shadow-sm shadow-slate-100"
                  }`}
                  style={{ boxShadow: isDark ? "0 0 20px -8px rgba(59,130,246,0.15), inset 0 1px 1px rgba(255,255,255,0.03)" : "" }}
                >
                  <div>
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider block">UPTIME</span>
                    <span className={`text-xl font-black font-mono tracking-tight block ${isDark ? "text-white" : "text-slate-800"}`}>
                      {formatUptime(systemStats?.process_uptime_seconds ?? 0)}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono mt-1 block">pid {systemStats?.pid ?? "--"}</span>
                </div>

                {/* 5. Threads */}
                <div 
                  className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
                    isDark ? "bg-slate-900/40 border-emerald-500/20 shadow-[0_0_20px_-8px_rgba(16,185,129,0.15)]" : "bg-white border-slate-200 shadow-sm shadow-slate-100"
                  }`}
                  style={{ boxShadow: isDark ? "0 0 20px -8px rgba(16,185,129,0.15), inset 0 1px 1px rgba(255,255,255,0.03)" : "" }}
                >
                  <div>
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block">THREADS</span>
                    <span className={`text-2xl font-black font-mono tracking-tight block ${isDark ? "text-white" : "text-slate-800"}`}>
                      {systemStats?.process_threads ?? "0"}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono mt-1 block">active worker threads</span>
                </div>

                {/* 6. Open Fds */}
                <div 
                  className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
                    isDark ? "bg-slate-900/40 border-cyan-500/20 shadow-[0_0_20px_-8px_rgba(6,182,212,0.15)]" : "bg-white border-slate-200 shadow-sm shadow-slate-100"
                  }`}
                  style={{ boxShadow: isDark ? "0 0 20px -8px rgba(6,182,212,0.15), inset 0 1px 1px rgba(255,255,255,0.03)" : "" }}
                >
                  <div>
                    <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-wider block">OPEN FDS</span>
                    <span className={`text-2xl font-black font-mono tracking-tight block ${isDark ? "text-white" : "text-slate-800"}`}>
                      {systemStats?.process_fds ?? "0"}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono mt-1 block">file descriptors</span>
                </div>

                {/* 7. Connections */}
                <div 
                  className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
                    isDark ? "bg-slate-900/40 border-blue-500/20 shadow-[0_0_20px_-8px_rgba(59,130,246,0.15)]" : "bg-white border-slate-200 shadow-sm shadow-slate-100"
                  }`}
                  style={{ boxShadow: isDark ? "0 0 20px -8px rgba(59,130,246,0.15), inset 0 1px 1px rgba(255,255,255,0.03)" : "" }}
                >
                  <div>
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider block">CONNECTIONS</span>
                    <span className={`text-2xl font-black font-mono tracking-tight block ${isDark ? "text-white" : "text-slate-800"}`}>
                      {systemStats?.process_connections ?? "0"}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono mt-1 block">active TCP links</span>
                </div>

                {/* 8. Virtual Mem */}
                <div 
                  className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
                    isDark ? "bg-slate-900/40 border-teal-500/20 shadow-[0_0_20px_-8px_rgba(20,184,166,0.15)]" : "bg-white border-slate-200 shadow-sm shadow-slate-100"
                  }`}
                  style={{ boxShadow: isDark ? "0 0 20px -8px rgba(20,184,166,0.15), inset 0 1px 1px rgba(255,255,255,0.03)" : "" }}
                >
                  <div>
                    <span className="text-[10px] font-bold text-teal-500 uppercase tracking-wider block">VIRTUAL MEM</span>
                    <span className={`text-2xl font-black font-mono tracking-tight block ${isDark ? "text-white" : "text-slate-800"}`}>
                      {systemStats?.process_vms_mb.toFixed(0) ?? "0"} <span className="text-xs font-normal text-slate-500">MB</span>
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono mt-1 block">VMS allocation</span>
                </div>

              </div>

              {/* Row 2: Two Large Neon Charts Side-by-Side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BigChart 
                  data={cpuHistory} 
                  color="#06b6d4" 
                  label="CPU USAGE" 
                  currentValue={systemStats?.cpu_percent.toFixed(1) ?? "0.0"} 
                  unit="%" 
                  isDark={isDark} 
                />
                <BigChart 
                  data={memoryRssHistory} 
                  color="#a855f7" 
                  label="MEMORY - RSS" 
                  currentValue={systemStats?.process_rss_mb.toFixed(0) ?? "0"} 
                  unit="MB" 
                  isDark={isDark} 
                />
              </div>

              {/* Row 3: Advanced Logs Inspector */}
              <div className={`rounded-2xl border flex flex-col overflow-hidden transition-all duration-300 ${
                isDark ? "bg-slate-900/30 border-slate-850 shadow-[0_15px_35px_-10px_rgba(0,0,0,0.5)]" : "bg-white border-slate-200 shadow-sm shadow-slate-200"
              }`}>
                {/* Header / Filter Toolbar */}
                <div className={`p-4 border-b space-y-3 shrink-0 ${isDark ? "bg-slate-900/40 border-slate-850" : "bg-slate-50/80 border-slate-200"}`}>
                  
                  {/* Title & Stats */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      <Terminal className="w-4 h-4 text-indigo-500" /> LIVE LOGS
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      Showing {logs.length} entries
                    </span>
                  </div>

                  {/* Level & Tags Selection Grid */}
                  <div className="flex flex-wrap gap-2 items-center">
                    
                    {/* Severity Filters */}
                    <div className="flex items-center gap-1 bg-slate-950/20 dark:bg-slate-950/40 p-1 rounded-lg border border-slate-250 dark:border-slate-850">
                      {(["CRIT", "ERROR", "WARN", "INFO", "DEBUG"] as const).map((lvl) => {
                        const isSelected = selectedLevels.includes(lvl);
                        let colorClass = "";
                        if (lvl === "CRIT" || lvl === "ERROR") colorClass = isSelected ? "bg-red-500 text-white shadow-lg shadow-red-500/25" : "hover:bg-red-500/10 text-red-400";
                        else if (lvl === "WARN") colorClass = isSelected ? "bg-amber-500 text-white shadow-lg shadow-amber-500/25" : "hover:bg-amber-500/10 text-amber-400";
                        else if (lvl === "INFO") colorClass = isSelected ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/25" : "hover:bg-cyan-500/10 text-cyan-400";
                        else if (lvl === "DEBUG") colorClass = isSelected ? "bg-purple-500 text-white shadow-lg shadow-purple-500/25" : "hover:bg-purple-500/10 text-purple-400";

                        return (
                          <button
                            key={lvl}
                            onClick={() => {
                              setSelectedLevels((prev) => 
                                prev.includes(lvl) ? prev.filter((x) => x !== lvl) : [...prev, lvl]
                              );
                            }}
                            className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition-all ${colorClass}`}
                          >
                            {lvl}
                          </button>
                        );
                      })}
                    </div>

                    {/* Component Filters */}
                    <div className="flex items-center gap-1 bg-slate-950/20 dark:bg-slate-950/40 p-1 rounded-lg border border-slate-250 dark:border-slate-850">
                      {(["server", "dashboard", "heartbeat"] as const).map((comp) => {
                        const isSelected = selectedComponents.includes(comp);
                        return (
                          <button
                            key={comp}
                            onClick={() => {
                              setSelectedComponents((prev) => 
                                prev.includes(comp) ? prev.filter((x) => x !== comp) : [...prev, comp]
                              );
                            }}
                            className={`px-2.5 py-0.5 rounded text-[9px] font-bold tracking-tight transition-all ${
                              isSelected 
                                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25" 
                                : "hover:bg-indigo-500/10 text-slate-400"
                            }`}
                          >
                            {comp}
                          </button>
                        );
                      })}
                    </div>

                    {/* Text Search Box */}
                    <div className="flex-1 min-w-[200px]">
                      <input 
                        type="text"
                        value={logSearchQuery}
                        onChange={(e) => setLogSearchQuery(e.target.value)}
                        placeholder="filter_ (use /regex/ for regex)"
                        className={`w-full px-3 py-1 rounded-lg text-xs font-mono border focus:outline-none transition-all ${
                          isDark ? "bg-slate-950 border-slate-850 text-white focus:border-indigo-500" : "bg-white border-slate-200 text-slate-800 focus:border-indigo-500 shadow-inner"
                        }`}
                      />
                    </div>

                    {/* Actions Toolbar */}
                    <div className="flex items-center gap-1 bg-slate-950/20 dark:bg-slate-950/40 p-1 rounded-lg border border-slate-250 dark:border-slate-850 shrink-0">
                      {/* Autoscroll */}
                      <button
                        onClick={() => setAutoscroll(!autoscroll)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                          autoscroll 
                            ? "bg-emerald-600 text-white" 
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        autoscroll {autoscroll ? "✓" : ""}
                      </button>

                      {/* Pause */}
                      <button
                        onClick={() => setLogsPaused(!logsPaused)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                          logsPaused 
                            ? "bg-amber-600 text-white" 
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {logsPaused ? "paused" : "pause"}
                      </button>

                      {/* Wrap */}
                      <button
                        onClick={() => setWrapLogs(!wrapLogs)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                          wrapLogs 
                            ? "bg-indigo-600 text-white" 
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        wrap
                      </button>

                      {/* Download */}
                      <button
                        onClick={handleDownloadLogs}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold text-slate-400 hover:text-white transition-all"
                      >
                        download
                      </button>

                      {/* Clear */}
                      <button
                        onClick={handleClearLogs}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        clear
                      </button>
                    </div>

                  </div>
                </div>

                {/* Terminal logs list */}
                <div className={`flex-1 p-4 overflow-y-auto font-mono text-[10px] leading-relaxed min-h-80 max-h-[500px] space-y-0.5 ${
                  isDark ? "bg-[#05070a]/95 text-slate-300" : "bg-white text-slate-700 shadow-inner"
                }`}>
                  {(() => {
                    const filteredLogs = logs.filter((line) => {
                      // Level check
                      if (selectedLevels.length > 0) {
                        const matches = selectedLevels.some((lvl) => {
                          const tag = `[${lvl}]`;
                          if (lvl === "WARN") return line.includes("[WARN]") || line.includes("[WARNING]");
                          if (lvl === "CRIT") return line.includes("[CRIT]") || line.includes("[CRITICAL]");
                          return line.includes(tag);
                        });
                        if (!matches) return false;
                      }

                      // Component check
                      if (selectedComponents.length > 0) {
                        const matches = selectedComponents.some((comp) => {
                          if (comp === "server") return line.includes("server") || line.includes("127.0.0.1") || line.includes("HTTP/");
                          if (comp === "dashboard") return line.includes("dashboard") || line.includes("system");
                          if (comp === "heartbeat") return line.includes("heartbeat") || line.includes("pulse") || line.includes("ping");
                          return line.toLowerCase().includes(comp);
                        });
                        if (!matches) return false;
                      }

                      // Search check
                      if (logSearchQuery.trim()) {
                        const query = logSearchQuery.trim();
                        if (query.startsWith("/") && query.endsWith("/") && query.length > 2) {
                          try {
                            const regex = new RegExp(query.slice(1, -1), "i");
                            return regex.test(line);
                          } catch (e) {
                            return false;
                          }
                        } else {
                          return line.toLowerCase().includes(query.toLowerCase());
                        }
                      }

                      return true;
                    });

                    if (filteredLogs.length === 0) {
                      return (
                        <div className="text-slate-500 text-center py-16">
                          No log streams found matching filters.
                        </div>
                      );
                    }

                    return filteredLogs.map((log, idx) => {
                      const levelMatch = log.match(/\[(INFO|WARNING|WARN|ERROR|DEBUG|CRIT|CRITICAL)\]/i);
                      let level = levelMatch ? levelMatch[1].toUpperCase() : null;
                      if (level === "WARNING") level = "WARN";
                      if (level === "CRITICAL") level = "CRIT";

                      let displayLine = log;
                      let timeStr = "";
                      const timeMatch = log.match(/^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}|\d{2}:\d{2}:\d{2})/);
                      if (timeMatch) {
                        timeStr = timeMatch[0];
                        displayLine = log.substring(timeStr.length).trim();
                      }

                      let levelColor = "text-slate-400";
                      if (level === "ERROR" || level === "CRIT") levelColor = "text-red-400 font-bold bg-red-950/30 px-1.5 py-0.5 rounded border border-red-500/10";
                      else if (level === "WARN") levelColor = "text-amber-400 font-bold bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-500/10";
                      else if (level === "INFO") levelColor = "text-cyan-400 font-bold bg-cyan-950/30 px-1.5 py-0.5 rounded border border-cyan-500/10";
                      else if (level === "DEBUG") levelColor = "text-purple-400 font-bold bg-purple-950/30 px-1.5 py-0.5 rounded border border-purple-500/10";

                      return (
                        <div key={idx} className={`flex items-start gap-3 py-1 font-mono tracking-tight border-b ${
                          isDark ? "border-slate-900/30" : "border-slate-100"
                        } ${wrapLogs ? "whitespace-pre-wrap" : "whitespace-nowrap overflow-x-auto"}`}>
                          {timeStr && <span className="text-slate-500 dark:text-slate-400 shrink-0 font-semibold">{timeStr}</span>}
                          {level && <span className={`${levelColor} shrink-0 text-[9px] font-black uppercase tracking-wider`}>{level}</span>}
                          <span className="flex-1 select-text">{displayLine}</span>
                        </div>
                      );
                    });
                  })()}
                  <div ref={logTerminalEndRef} />
                </div>
              </div>

            </div>

          </div>
        ) : !activeBot ? (
          /* Empty Dashboard Landing Screen */
          <div className={`flex-1 flex flex-col items-center justify-center p-8 transition-all duration-300 ${isDark ? "bg-gradient-to-b from-slate-900 to-[#090b10]" : "bg-gradient-to-b from-slate-100 to-slate-50"}`}>
            <div className="max-w-2xl text-center space-y-6">
              <div className={`inline-flex p-4 rounded-3xl mb-2 border ${
                isDark ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : "bg-indigo-50 text-indigo-600 border-indigo-100 shadow-sm"
              }`}>
                <Bot className="w-16 h-16" />
              </div>
              <h2 className={`text-4xl font-extrabold tracking-tight sm:text-5xl ${isDark ? "text-white" : "text-slate-800"}`}>Build Your Local RAG Assistant</h2>
              <p className={`text-base ${sTextMuted}`}>
                Create lightweight, secure knowledge bots powered by your local models. Upload custom documents (cricket, football, coding guidelines) and query them through private APIs.
              </p>
              
              <div className="flex justify-center gap-4 pt-4">
                <button 
                  onClick={() => setIsCreateModalOpen(true)}
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all duration-200"
                >
                  Create Your First Bot
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12 text-left">
                <div className={`p-5 rounded-2xl border transition-all duration-300 ${sCard}`}>
                  <h4 className={`text-sm font-bold mb-1 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                    <Check className="w-4 h-4 text-emerald-500" /> Local & Private
                  </h4>
                  <p className={`text-xs ${sTextMuted}`}>Your documents never leave your computer. Powered fully by Ollama or LM Studio.</p>
                </div>
                <div className={`p-5 rounded-2xl border transition-all duration-300 ${sCard}`}>
                  <h4 className={`text-sm font-bold mb-1 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                    <Code className="w-4 h-4 text-blue-500" /> Ready-to-use API
                  </h4>
                  <p className={`text-xs ${sTextMuted}`}>Every bot automatically exposes a dedicated POST endpoint for integration into your workflows.</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Active Bot Workspace */
          <div className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 ${isDark ? "bg-[#090b10]" : "bg-slate-50"}`}>
            {/* Workspace Header */}
            <div className={`px-8 py-5 border-b flex items-center justify-between shrink-0 transition-all duration-300 ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200 shadow-sm shadow-slate-100/30"}`}>
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  isDark ? "bg-slate-850 border border-slate-700 text-indigo-400" : "bg-indigo-50 border border-indigo-100 text-indigo-600 shadow-sm"
                }`}>
                  <Bot className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{activeBot.name}</h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {activeBot.provider}
                    </span>
                  </div>
                  <p className={`text-sm mt-0.5 ${sTextMuted}`}>{activeBot.description || "No description provided."}</p>
                </div>
              </div>

              {/* Workspace Tabs */}
              <div className={`flex items-center gap-1 p-1 rounded-xl border transition-all duration-300 ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"}`}>
                {(["chat", "documents", "settings"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-150 ${
                      activeTab === tab 
                        ? isDark 
                          ? "bg-slate-850 text-white shadow-sm" 
                          : "bg-white text-slate-800 shadow-sm border border-slate-150"
                        : isDark
                          ? "text-slate-400 hover:text-white"
                          : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {tab === "chat" ? "Chat Playground" : tab === "documents" ? "Documents" : "Configuration & API"}
                  </button>
                ))}
              </div>
            </div>

            {/* Workspace Panels */}
            <div className="flex-1 overflow-hidden relative">
              
              {/* Tab: Chat Playground */}
              {activeTab === "chat" && (
                <div className="h-full flex overflow-hidden">
                  
                  {/* Left Side: Sessions List inside Chat tab */}
                  <div className={`w-56 flex flex-col justify-between shrink-0 border-r transition-all duration-300 ${
                    isDark ? "bg-slate-900/60 border-slate-950" : "bg-white border-slate-200"
                  }`}>
                    <div className={`p-3 border-b flex items-center justify-between transition-all duration-300 ${sBorder}`}>
                      <span className={`text-xs font-bold flex items-center gap-1 ${sTextMuted}`}>
                        <History className="w-3.5 h-3.5" /> Sessions
                      </span>
                      <button 
                        onClick={handleCreateSession}
                        className={`p-1 rounded transition-all ${
                          isDark ? "bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white" : "bg-slate-100 hover:bg-indigo-600 text-slate-600 hover:text-white border border-slate-200 shadow-sm"
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {sessions.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => handleSelectSession(s.id)}
                          className={`group w-full p-2 rounded-lg text-xs font-medium cursor-pointer flex items-center justify-between transition-all ${
                            activeSessionId === s.id 
                              ? "bg-indigo-500/10 border border-indigo-500/25 text-indigo-400" 
                              : isDark
                                ? "hover:bg-slate-850 border border-transparent text-slate-400 hover:text-slate-200"
                                : "hover:bg-slate-100 border border-transparent text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {sessionToDelete === s.id ? (
                            <>
                              <span className="text-red-400 font-semibold truncate flex-1 pr-2">Delete session?</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSession(s.id);
                                  }}
                                  className="p-1 rounded bg-red-600 hover:bg-red-750 text-white transition-all animate-fade-in"
                                  title="Confirm Delete"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSessionToDelete(null);
                                  }}
                                  className={`p-1 rounded transition-all ${isDark ? "bg-slate-800 text-slate-400 hover:bg-slate-700" : "bg-slate-200 text-slate-600 hover:bg-slate-350"}`}
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="truncate flex-1 pr-2">{s.name}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSessionToDelete(s.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
 
                  {/* Center: Chat Window */}
                  <div className={`flex-1 flex flex-col h-full transition-all duration-300 ${isDark ? "bg-[#05070a]" : "bg-white border-r border-slate-150"}`}>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {chatMessages.length === 0 ? (
                        <div className={`max-w-2xl mx-auto text-center py-12 ${sTextMuted}`}>
                          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-25" />
                          <p className="text-sm">Start a conversation. The assistant will search the uploaded documents to craft responses.</p>
                        </div>
                      ) : (
                        chatMessages.map((msg, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-start gap-4 max-w-3xl mx-auto mb-6"
                          >
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              msg.sender === "user" ? "bg-slate-850 border border-slate-700 text-slate-300 shadow-sm" : "bg-indigo-600 text-white"
                            }`}>
                              {msg.sender === "user" ? "U" : "B"}
                            </div>
                            <div className={`flex-1 min-w-0 border rounded-2xl px-4 py-3 text-sm ${
                              msg.sender === "user" 
                                ? isDark
                                  ? "bg-slate-900/40 border-slate-850 text-slate-100" 
                                  : "bg-slate-50 border-slate-200 text-slate-800"
                                : msg.error
                                ? "bg-red-500/10 border-red-500/20 text-red-300"
                                : isDark
                                ? "bg-indigo-500/5 border-indigo-500/10 text-slate-200"
                                : "bg-indigo-50/20 border-indigo-500/10 text-slate-700"
                            }`}>
                              <p className="whitespace-pre-wrap leading-relaxed">
                                {msg.text || (isChatGenerating && idx === chatMessages.length - 1 ? "Typing..." : "")}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
 
                    <div className={`p-4 border-t shrink-0 transition-all duration-300 ${isDark ? "border-slate-900 bg-slate-900/20" : "border-slate-200 bg-slate-50"}`}>
                      <form onSubmit={handleSendChatMessage} className="max-w-3xl mx-auto flex gap-2">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Ask a question about your documents..."
                          className={`flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all ${sInput}`}
                        />
                        <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl font-medium text-sm flex items-center gap-2 shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all">
                          <span>Send</span>
                          <Send className="w-4 h-4" />
                        </button>
                      </form>
                    </div>
                  </div>
 
                  {/* Context Panel */}
                  <div className={`w-96 flex flex-col shrink-0 border-l transition-all duration-300 ${
                    isDark ? "bg-slate-900/30 border-slate-950" : "bg-white border-slate-200"
                  }`}>
                    <div className={`p-4 border-b transition-all duration-300 ${sBorder}`}>
                      <h3 className={`font-bold flex items-center gap-2 text-sm ${isDark ? "text-slate-350" : "text-slate-700"}`}>
                        <Database className="w-4 h-4 text-indigo-500" /> Retrieved Context
                      </h3>
                      <p className={`text-[10px] mt-1 ${sTextMuted}`}>This context was injected into the LLM prompt to answer your query.</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {retrievedSources.length === 0 ? (
                        <div className="text-xs text-slate-550 text-center py-8">
                          No sources retrieved yet. Submit a message.
                        </div>
                      ) : (
                        retrievedSources.map((src, index) => (
                          <div key={index} className={`p-3 border rounded-xl space-y-1.5 transition-all duration-300 ${sCard}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/10">
                                Segment #{index + 1}
                              </span>
                              <span className="text-[9px] text-slate-500 truncate max-w-[120px]">
                                {src.metadata?.doc_name || "N/A"}
                              </span>
                            </div>
                            <p className={`text-[10px] leading-relaxed max-h-36 overflow-y-auto ${isDark ? "text-slate-400" : "text-slate-650"}`}>
                              {src.content}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Documents */}
              {activeTab === "documents" && (
                <div className={`h-full overflow-y-auto p-8 transition-all duration-300 ${isDark ? "bg-[#090b10]" : "bg-slate-50"}`}>
                  <div className="max-w-4xl mx-auto space-y-6">
                    <div>
                      <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-800"}`}>Bot Knowledge Base</h3>
                      <p className={`text-xs ${sTextMuted}`}>Upload documents to index them into vector segments.</p>
                    </div>

                    <div className={`border-2 border-dashed rounded-2xl p-8 transition-all duration-200 text-center relative ${
                      isDark 
                        ? "border-slate-800 bg-slate-900/20 hover:border-indigo-500/50 hover:bg-slate-900/40" 
                        : "border-slate-250 bg-white shadow-sm hover:border-indigo-500 hover:bg-slate-50/50"
                    }`}>
                      <input 
                        type="file" 
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                      />
                      <div className="space-y-3 pointer-events-none">
                        <div className={`inline-flex p-3 rounded-xl transition-all ${isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500 border border-slate-200 shadow-sm"}`}>
                          <UploadCloud className="w-8 h-8" />
                        </div>
                        <div className={`text-sm font-semibold ${isDark ? "text-slate-350" : "text-slate-700"}`}>Click to upload file</div>
                        <div className={`text-xs ${sTextMuted}`}>Supports Text (.txt), Markdown (.md), PDF (.pdf), or Word (.docx)</div>
                      </div>
                    </div>

                    {isUploading && (
                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all duration-300 ${sCard}`}>
                        <div className="flex items-center gap-3">
                          <Loader className="w-5 h-5 text-indigo-400 animate-spin" />
                          <span className={`text-xs ${isDark ? "text-slate-300" : "text-slate-650"}`}>Processing & embedding chunks...</span>
                        </div>
                      </div>
                    )}

                    <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${sCard}`}>
                      <div className={`p-4 border-b ${sBorder}`}>
                        <h4 className={`text-sm font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Indexed Files</h4>
                      </div>
                      <div className={`divide-y ${isDark ? "divide-slate-850" : "divide-slate-150"}`}>
                        {documents.length === 0 ? (
                          <div className={`p-6 text-center text-xs ${sTextMuted}`}>
                            No documents uploaded yet.
                          </div>
                        ) : (
                          documents.map((doc) => (
                            <div key={doc.id} className={`flex items-center justify-between p-4 ${isDark ? "bg-slate-900/10" : "bg-slate-50/40"}`}>
                              <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-indigo-500" />
                                <div>
                                  <p className={`text-xs font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{doc.name}</p>
                                  <p className={`text-[10px] ${sTextMuted}`}>{(doc.content.length / 1024).toFixed(1)} KB</p>
                                </div>
                              </div>
                              <button 
                                onClick={() => handleDeleteDoc(doc.id)}
                                className={`p-1.5 rounded-lg transition-all ${
                                  isDark ? "text-slate-500 hover:text-red-400 hover:bg-red-500/10" : "text-slate-400 hover:text-red-650 hover:bg-red-50"
                                }`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Settings & API */}
              {activeTab === "settings" && (
                <div className={`h-full overflow-y-auto p-8 transition-all duration-300 ${isDark ? "bg-[#090b10]" : "bg-slate-50"}`}>
                  <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Config Form */}
                    <div className={`border rounded-2xl p-6 space-y-4 transition-all duration-300 ${sCard}`}>
                      <h3 className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-slate-800"}`}>Bot Settings</h3>
                      
                      <div>
                        <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${sTextMuted}`}>Bot Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className={`w-full rounded-lg p-2.5 text-sm focus:outline-none transition-all ${sInput}`}
                        />
                      </div>

                      <div>
                        <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${sTextMuted}`}>Description</label>
                        <input
                          type="text"
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          className={`w-full rounded-lg p-2.5 text-sm focus:outline-none transition-all ${sInput}`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${sTextMuted}`}>Search Technique</label>
                          <select
                            value={editTechnique}
                            onChange={(e) => setEditTechnique(e.target.value)}
                            className={`w-full rounded-lg p-2.5 text-sm focus:outline-none transition-all ${sInput}`}
                          >
                            <option value="vector">Vector Search</option>
                            <option value="keyword">Keyword Match</option>
                            <option value="hybrid">Hybrid Search</option>
                          </select>
                        </div>
                        <div>
                          <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${sTextMuted}`}>LLM Model</label>
                          <input
                            type="text"
                            value={editLlm}
                            onChange={(e) => setEditLlm(e.target.value)}
                            className={`w-full rounded-lg p-2.5 text-sm focus:outline-none transition-all ${sInput}`}
                          />
                        </div>
                      </div>

                      {/* Generation Parameter: Temperature */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${sTextMuted}`}>
                            <Sliders className="w-3.5 h-3.5" /> LLM Temperature ({editTemp})
                          </label>
                        </div>
                        <input 
                          type="range" 
                          min="0.0" 
                          max="1.0" 
                          step="0.05"
                          value={editTemp} 
                          onChange={(e) => setEditTemp(parseFloat(e.target.value))}
                          className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500 ${isDark ? "bg-slate-950" : "bg-slate-200"}`} 
                        />
                      </div>

                      <div>
                        <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${sTextMuted}`}>System Prompt</label>
                        <textarea
                          rows={3}
                          value={editSystemPrompt}
                          onChange={(e) => setEditSystemPrompt(e.target.value)}
                          className={`w-full rounded-lg p-2.5 text-sm focus:outline-none transition-all ${sInput}`}
                        />
                      </div>

                      <div className={`flex items-center justify-between pt-4 border-t transition-all duration-300 ${sBorder}`}>
                        <button 
                          onClick={handleDeleteBot}
                          className="text-xs text-red-400 hover:text-red-500 font-semibold flex items-center gap-1.5 transition-all"
                        >
                          <Trash2 className="w-4 h-4" /> Delete Bot
                        </button>
                        <button 
                          onClick={handleSaveSettings}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow hover:scale-[1.01] transition-all"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>

                    {/* API Integration details */}
                    <div className={`border rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 ${sCard}`}>
                      <div>
                        <h3 className={`text-lg font-bold mb-2 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}>
                          <Code className="w-5 h-5 text-indigo-500" /> REST API Integration
                        </h3>
                        <p className={`text-xs mb-6 ${sTextMuted}`}>Query this bot programmatically by sending a POST request.</p>

                        <div className="space-y-4">
                          <div>
                            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${sTextMuted}`}>Endpoint URL</label>
                            <div className={`border rounded-lg p-2.5 flex items-center justify-between transition-all ${
                              isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-150 shadow-inner"
                            }`}>
                              <code className="text-xs text-indigo-500 break-all select-all font-mono font-semibold">{getApiEndpoint()}</code>
                            </div>
                          </div>

                          <div>
                            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${sTextMuted}`}>cURL Example</label>
                            <pre className={`border rounded-lg p-3 text-[10px] overflow-x-auto select-all font-mono ${
                              isDark ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-150 text-slate-700 shadow-inner"
                            }`}>
                              {getCurlSnippet()}
                            </pre>
                          </div>
                        </div>
                      </div>

                      <div className={`p-4 rounded-xl border text-xs mt-6 transition-all ${
                        isDark ? "bg-indigo-500/5 border-indigo-500/10 text-slate-400" : "bg-indigo-50/20 border-indigo-500/10 text-slate-600"
                      }`}>
                        <strong className={isDark ? "text-slate-200" : "text-slate-800"}>Response format:</strong>
                        <pre className={`mt-2 text-[10px] overflow-x-auto font-mono font-semibold ${isDark ? "text-indigo-300" : "text-indigo-650"}`}>
{`{
  "bot": "${activeBot.name}",
  "query": "...",
  "response": "...",
  "sources": ["..."]
}`}
                        </pre>
                      </div>
                    </div>

                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </main>

      {/* Creation Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div 
            className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 transform scale-100 flex flex-col max-h-[90vh]"
            style={{
              boxShadow: "0 20px 50px -12px rgba(0,0,0,0.5), 0 0 40px -10px rgba(99, 102, 241, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.08)"
            }}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Plus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Configure New RAG Agent</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Set up local LLMs, vector search parameters, and customize agent identity.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsCreateModalOpen(false)} 
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left Column: Identity & Connection */}
                <div className="space-y-4">
                  <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-1.5">
                    1. Agent Identity
                  </div>
                  
                  {/* Bot Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Agent Name</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Bot className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={newBotName}
                        onChange={(e) => setNewBotName(e.target.value)}
                        placeholder="e.g. CricketBot"
                        className="w-full bg-slate-950/60 border border-slate-850 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <FileText className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={newBotDesc}
                        onChange={(e) => setNewBotDesc(e.target.value)}
                        placeholder="e.g. Expert on cricket metrics and rules"
                        className="w-full bg-slate-950/60 border border-slate-850 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>

                  {/* Local Provider Connection Group */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/20 space-y-4 mt-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Local Provider Connection</span>
                    </div>

                    {/* Provider Selection */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Provider Engine</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setNewBotProvider("ollama")}
                          className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                            newBotProvider === "ollama"
                              ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 ring-2 ring-indigo-500/20"
                              : "bg-slate-950/40 border-slate-850 hover:border-slate-800 text-slate-450"
                          }`}
                        >
                          <Cpu className="w-4 h-4 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-bold text-white">Ollama</div>
                            <div className="text-[9px] text-slate-500 mt-0.5">Local models (11434)</div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewBotProvider("lm_studio")}
                          className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                            newBotProvider === "lm_studio"
                              ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 ring-2 ring-indigo-500/20"
                              : "bg-slate-950/40 border-slate-850 hover:border-slate-800 text-slate-450"
                          }`}
                        >
                          <Layers className="w-4 h-4 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-bold text-white">LM Studio</div>
                            <div className="text-[9px] text-slate-500 mt-0.5">Local server (1234)</div>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* API URL */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Base Endpoint URL</label>
                      <input
                        type="text"
                        value={newBotUrl}
                        onChange={(e) => setNewBotUrl(e.target.value)}
                        className="w-full bg-slate-950/80 border border-slate-850 rounded-xl p-2.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>

                    {/* Trigger Detection Button */}
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/30 text-white py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/15 hover:shadow-indigo-500/30 transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${detectionStatus === "loading" ? "animate-spin" : ""}`} />
                      <span>Detect & Load Local Models</span>
                    </button>
                  </div>
                </div>

                {/* Right Column: Engine Config & Models */}
                <div className="space-y-4">
                  <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-1.5">
                    2. RAG & Model Configuration
                  </div>

                  {/* Connection Warning/Status Bar */}
                  {detectionStatus !== "idle" ? (
                    <div className={`text-xs p-3 rounded-xl flex items-start gap-2.5 border transition-all ${
                      detectionStatus === "loading"
                        ? "text-indigo-400 bg-indigo-500/5 border-indigo-500/10"
                        : detectionStatus === "success"
                        ? "text-emerald-400 bg-emerald-500/5 border-emerald-500/10"
                        : "text-red-400 bg-red-500/5 border-red-500/10"
                    }`}>
                      {detectionStatus === "loading" && <Loader className="w-4 h-4 animate-spin shrink-0 mt-0.5" />}
                      {detectionStatus === "success" && <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />}
                      {detectionStatus === "error" && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />}
                      <span className="leading-tight">{detectionMsg}</span>
                    </div>
                  ) : (
                    <div className="text-xs p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-amber-400 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500/80" />
                      <span className="leading-tight">Verify connection to load models list. Alternatively, you can type names manually.</span>
                    </div>
                  )}

                  {/* LLM Chat Model */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">LLM Chat Model</label>
                    <div className="space-y-2">
                      {detectedModels.length > 0 ? (
                        <select
                          value={newBotLlmSelect}
                          onChange={(e) => setNewBotLlmSelect(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        >
                          {detectedModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-xs bg-slate-950/45 border border-dashed border-slate-850 rounded-xl p-3 text-slate-500 text-center">
                          Please click 'Detect Models' to scan active engines
                        </div>
                      )}
                      <input
                        type="text"
                        value={newBotLlm}
                        onChange={(e) => setNewBotLlm(e.target.value)}
                        placeholder="Or type custom model name manually..."
                        className="w-full bg-slate-950/60 border border-slate-850 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>

                  {/* Embedding Model */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Embedding Model</label>
                    <div className="space-y-2">
                      {detectedModels.length > 0 ? (
                        <select
                          value={newBotEmbedSelect}
                          onChange={(e) => setNewBotEmbedSelect(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        >
                          {detectedModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-xs bg-slate-950/45 border border-dashed border-slate-850 rounded-xl p-3 text-slate-500 text-center">
                          Please click 'Detect Models' to scan active engines
                        </div>
                      )}
                      <input
                        type="text"
                        value={newBotEmbed}
                        onChange={(e) => setNewBotEmbed(e.target.value)}
                        placeholder="Or type custom embedding model manually..."
                        className="w-full bg-slate-950/60 border border-slate-850 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>

                  {/* Search Strategy */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Search Strategy</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: "vector", label: "Vector", desc: "Similarity search" },
                        { value: "keyword", label: "Keyword", desc: "Exact match" },
                        { value: "hybrid", label: "Hybrid", desc: "Combined power" }
                      ].map((strat) => (
                        <button
                          key={strat.value}
                          type="button"
                          onClick={() => setNewBotStrategy(strat.value)}
                          className={`p-2 rounded-xl border text-center flex flex-col justify-center transition-all ${
                            newBotStrategy === strat.value
                              ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 ring-1 ring-indigo-500/30"
                              : "bg-slate-950/40 border-slate-850 hover:border-slate-800 text-slate-450"
                          }`}
                        >
                          <span className="text-xs font-bold text-white">{strat.label}</span>
                          <span className="text-[8px] text-slate-500 mt-0.5">{strat.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bot Generation Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-indigo-500" /> 
                        <span>LLM Temperature ({newBotTemp})</span>
                      </label>
                      <span className="text-[9px] font-mono text-slate-500">
                        {newBotTemp <= 0.2 ? "Precise" : newBotTemp >= 0.7 ? "Creative" : "Balanced"}
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="0.0" 
                      max="1.0" 
                      step="0.05"
                      value={newBotTemp} 
                      onChange={(e) => setNewBotTemp(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/40 shrink-0">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-850 text-slate-350 text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBot}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Create Agent</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
