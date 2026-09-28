"""Summary module: short revision-friendly summaries of long text."""

from __future__ import annotations

from gemini_client import generate_text

SUMMARY_INSTRUCTION = (
    "Summarize the passage for quick revision. Preserve the important information, remove "
    "repetition, and use simple language. Do NOT add facts, examples, or opinions that are "
    "not in the passage. Format: one sentence that states the main idea, followed by "
    "3-7 concise bullet points with the key details. If the passage is very short or not "
    "educational, still summarize it faithfully."
)


def summarize_text(text: str) -> str:
    """Return a concise summary of an educational passage."""
    prompt = f"Passage to summarize:\n\"\"\"\n{text}\n\"\"\""
    return generate_text(prompt, SUMMARY_INSTRUCTION, temperature=0.2)
