"""Question & Answer module: short, clear answers to student questions."""

from __future__ import annotations

from gemini_client import generate_text

QA_INSTRUCTION = (
    "You are EduGenie, an educational assistant. Answer the student's question accurately "
    "and clearly. Explain difficult terms in simple language. Use examples when useful. "
    "Do not unnecessarily make the answer long. Start with a direct answer in one or two "
    "sentences, then add a few short supporting points if needed."
)


def answer_question(question: str) -> str:
    """Return Gemini's answer to a student's question."""
    prompt = f"Student's question:\n{question}"
    return generate_text(prompt, QA_INSTRUCTION, temperature=0.3)
