"""Metadata schema helpers and Qdrant filter construction."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from qdrant_client.http import models as qdrant_models


def parse_tags(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(t).strip() for t in raw if str(t).strip()]
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return []
        if raw.startswith("["):
            try:
                return parse_tags(json.loads(raw))
            except json.JSONDecodeError:
                pass
        return [t.strip() for t in raw.split(",") if t.strip()]
    return []


def normalize_document_metadata(
    *,
    doc_id: int,
    bot_id: int,
    name: str,
    source_type: str,
    tags: Optional[List[str]] = None,
    source_url: Optional[str] = None,
    author: Optional[str] = None,
    custom_fields: Optional[Dict[str, Any]] = None,
    uploaded_at: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "doc_id": doc_id,
        "bot_id": bot_id,
        "doc_name": name,
        "source_type": source_type,
        "tags": tags or [],
        "source_url": source_url or "",
        "author": author or "",
        "uploaded_at": uploaded_at or datetime.utcnow().isoformat(),
        "custom_fields": custom_fields or {},
    }


def build_qdrant_filter(filters: Optional[Dict[str, Any]]) -> Optional[qdrant_models.Filter]:
    """Build a Qdrant Filter from a retrieval filter dict."""
    if not filters:
        return None

    must: List[qdrant_models.FieldCondition] = []
    must_not: List[qdrant_models.FieldCondition] = []

    doc_ids = filters.get("doc_ids")
    if doc_ids:
        if len(doc_ids) == 1:
            must.append(
                qdrant_models.FieldCondition(
                    key="metadata.doc_id",
                    match=qdrant_models.MatchValue(value=int(doc_ids[0])),
                )
            )
        else:
            must.append(
                qdrant_models.FieldCondition(
                    key="metadata.doc_id",
                    match=qdrant_models.MatchAny(any=[int(d) for d in doc_ids]),
                )
            )

    exclude_doc_ids = filters.get("exclude_doc_ids")
    if exclude_doc_ids:
        for doc_id in exclude_doc_ids:
            must_not.append(
                qdrant_models.FieldCondition(
                    key="metadata.doc_id",
                    match=qdrant_models.MatchValue(value=int(doc_id)),
                )
            )

    source_type = filters.get("source_type")
    if source_type:
        must.append(
            qdrant_models.FieldCondition(
                key="metadata.source_type",
                match=qdrant_models.MatchValue(value=str(source_type)),
            )
        )

    author = filters.get("author")
    if author:
        must.append(
            qdrant_models.FieldCondition(
                key="metadata.author",
                match=qdrant_models.MatchValue(value=str(author)),
            )
        )

    tags = filters.get("tags")
    if tags:
        tag_mode = tags.get("mode", "any")
        tag_values = parse_tags(tags.get("values", []))
        if tag_values:
            if tag_mode == "all":
                for tag in tag_values:
                    must.append(
                        qdrant_models.FieldCondition(
                            key="metadata.tags",
                            match=qdrant_models.MatchValue(value=tag),
                        )
                    )
            else:
                must.append(
                    qdrant_models.FieldCondition(
                        key="metadata.tags",
                        match=qdrant_models.MatchAny(any=tag_values),
                    )
                )

    date_range = filters.get("date_range")
    if date_range:
        if date_range.get("from"):
            must.append(
                qdrant_models.FieldCondition(
                    key="metadata.uploaded_at",
                    range=qdrant_models.Range(gte=str(date_range["from"])),
                )
            )
        if date_range.get("to"):
            must.append(
                qdrant_models.FieldCondition(
                    key="metadata.uploaded_at",
                    range=qdrant_models.Range(lte=str(date_range["to"])),
                )
            )

    page_range = filters.get("page_range")
    if page_range:
        if page_range.get("from") is not None:
            must.append(
                qdrant_models.FieldCondition(
                    key="metadata.page_number",
                    range=qdrant_models.Range(gte=int(page_range["from"])),
                )
            )
        if page_range.get("to") is not None:
            must.append(
                qdrant_models.FieldCondition(
                    key="metadata.page_number",
                    range=qdrant_models.Range(lte=int(page_range["to"])),
                )
            )

    custom = filters.get("custom")
    if custom and isinstance(custom, dict):
        for key, value in custom.items():
            must.append(
                qdrant_models.FieldCondition(
                    key=f"metadata.custom_fields.{key}",
                    match=qdrant_models.MatchValue(value=value),
                )
            )

    if not must and not must_not:
        return None

    return qdrant_models.Filter(must=must or None, must_not=must_not or None)


def merge_filters(default: Optional[Dict], override: Optional[Dict]) -> Optional[Dict]:
    if not default:
        return override
    if not override:
        return default
    merged = json.loads(json.dumps(default))
    for key, value in override.items():
        if value is not None and value != "" and value != []:
            merged[key] = value
    return merged


def compute_facets(points_payloads: List[Dict[str, Any]]) -> Dict[str, Any]:
    tags: Dict[str, int] = {}
    source_types: Dict[str, int] = {}
    authors: Dict[str, int] = {}
    documents: List[Dict[str, Any]] = []

    seen_docs: set = set()
    for payload in points_payloads:
        meta = payload.get("metadata") or {}
        doc_id = meta.get("doc_id")
        if doc_id and doc_id not in seen_docs:
            seen_docs.add(doc_id)
            documents.append({
                "doc_id": doc_id,
                "doc_name": meta.get("doc_name", ""),
                "source_type": meta.get("source_type", ""),
                "tags": meta.get("tags", []),
            })
        for tag in meta.get("tags") or []:
            tags[tag] = tags.get(tag, 0) + 1
        st = meta.get("source_type") or "unknown"
        source_types[st] = source_types.get(st, 0) + 1
        author = meta.get("author") or ""
        if author:
            authors[author] = authors.get(author, 0) + 1

    return {
        "tags": [{"value": k, "count": v} for k, v in sorted(tags.items())],
        "source_types": [{"value": k, "count": v} for k, v in sorted(source_types.items())],
        "authors": [{"value": k, "count": v} for k, v in sorted(authors.items())],
        "documents": documents,
    }
