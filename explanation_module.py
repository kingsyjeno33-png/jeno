"""Concept explanation module.

By default explanations come from Gemini. If you set USE_LOCAL_MODEL=true in .env
and have `transformers` + `torch` installed, a local LaMini-Flan-T5 model is tried
first. If it is unavailable or fails, EduGenie silently falls back to Gemini, so the
app always runs.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from gemini_client import generate_text

logger = logging.getLogger("edugenie")

LOCAL_MODEL_NAME = "MBZUAI/LaMini-Flan-T5-248M"

EXPLAIN_INSTRUCTION = (
    "Explain the topic to a beginner in simple language. Use exactly these four "
    "second-level markdown headings, in this order, and nothing before the first heading:\n"
    "## Simple Definition\n(1-2 plain sentences)\n"
    "## Main Points\n(3-5 short bullet points)\n"
    "## Easy Example\n(one relatable, concrete example; use a short code snippet only "
    "if the topic is programming)\n"
    "## Short Summary\n(one or two sentences for quick revision)\n"
    "Avoid jargon; if you must use a technical term, explain it right away."
)

_local_pipeline: Any = None
_local_failed = False


def _local_model_enabled() -> bool:
    return os.getenv("USE_LOCAL_MODEL", "false").strip().lower() in {"1", "true", "yes"}


def _explain_with_local_model(topic: str) -> Optional[str]:
    """Try the local LaMini-Flan-T5 model. Returns None if it can't be used."""
    global _local_pipeline, _local_failed
    if _local_failed:
        return None
    try:
        if _local_pipeline is None:
            from transformers import pipeline  # optional dependency

            _local_pipeline = pipeline("text2text-generation", model=LOCAL_MODEL_NAME)
        output = _local_pipeline(
            f"Explain this in simple language for a beginner: {topic}",
            max_length=256,
            do_sample=False,
        )
        text = output[0]["generated_text"].strip()
        if not text:
            return None
        return f"## Simple Definition\n{text}"
    except Exception:  # missing package, download failure, out of memory...
        logger.warning("Local explanation model unavailable; falling back to Gemini.")
        _local_failed = True
        return None


def explain_topic(topic: str) -> str:
    """Explain a concept simply. Uses the local model if enabled, else Gemini."""
    if _local_model_enabled():
        local_result = _explain_with_local_model(topic)
        if local_result:
            return local_result
    prompt = f"Topic to explain:\n{topic}"
    return generate_text(prompt, EXPLAIN_INSTRUCTION, temperature=0.4)
