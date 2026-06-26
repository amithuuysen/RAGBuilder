"use client";

import React from "react";

/** Lightweight markdown renderer for chat messages (headings, bold, code, links, lists). */
export function MarkdownMessage({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    let content: React.ReactNode = formatInline(line);

    if (line.startsWith("### ")) {
      content = <h4 className="font-bold text-sm mt-2 mb-1">{formatInline(line.slice(4))}</h4>;
    } else if (line.startsWith("## ")) {
      content = <h3 className="font-bold text-base mt-2 mb-1">{formatInline(line.slice(3))}</h3>;
    } else if (line.startsWith("# ")) {
      content = <h2 className="font-bold text-lg mt-2 mb-1">{formatInline(line.slice(2))}</h2>;
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      content = (
        <li className="ml-4 list-disc">{formatInline(line.slice(2))}</li>
      );
    } else if (line.match(/^\d+\.\s/)) {
      content = (
        <li className="ml-4 list-decimal">{formatInline(line.replace(/^\d+\.\s/, ""))}</li>
      );
    } else if (line.trim() === "") {
      content = <br />;
    } else {
      content = <p className="leading-relaxed">{content}</p>;
    }

    elements.push(<React.Fragment key={i}>{content}</React.Fragment>);
  });

  return <div className="space-y-1">{elements}</div>;
}

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={match.index} className="px-1 py-0.5 rounded bg-black/20 text-xs font-mono">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        parts.push(
          <a key={match.index} href={linkMatch[2]} className="text-indigo-400 underline" target="_blank" rel="noreferrer">
            {linkMatch[1]}
          </a>
        );
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
