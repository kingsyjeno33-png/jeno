"""Quiz module: generates exactly 3 multiple-choice questions with 4 options each."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from gemini_client import GeminiError, generate_text

logger = logging.getLogger("edugenie")

NUM_QUESTIONS = 3
NUM_OPTIONS = 4

QUIZ_INSTRUCTION = (
    f"Create a multiple-choice quiz from the topic or passage. Return ONLY valid JSON, with no "
    f"markdown and no commentary, in exactly this shape:\n"
    '{"questions": [{"question": "...", "options": ["...", "...", "...", "..."], '
    '"correct_answer": "...", "explanation": "..."}]}\n'
    f"Rules: exactly {NUM_QUESTIONS} questions; exactly {NUM_OPTIONS} options per question; "
    "exactly one option is correct; correct_answer must be copied exactly from options; "
    "the wrong options must be plausible but clearly wrong; the correct answer must not "
    "always be in the same position; explanation is one or two simple sentences; "
    "if a passage is given, base every question on that passage only."
)


def clean_json_block(raw: str) -> str:
    """Remove ```json ... ``` fences (and stray text) so the JSON can be parsed."""
    text = raw.strip()
    text = re.sub(r"^```(?:json|JSON)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text).strip()
    # If there is still text around the JSON object, keep only the object.
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        text = text[start : end + 1]
    return text


def _match_option(answer: str, options: list[str]) -> str | None:
    """Find which option the model meant, tolerating case, spacing or a letter label."""
    normalized = answer.strip().lower()
    for option in options:
        if option.strip().lower() == normalized:
            return option
    letter = re.match(r"^\(?([a-d])[\).:]?$", normalized)  # e.g. "B" or "b)"
    if letter:
        return options[ord(letter.group(1)) - ord("a")]
    return None


def validate_quiz(data: Any) -> dict[str, list[dict[str, Any]]]:
    """Check the structure Gemini returned and normalize it. Raises ValueError."""
    if not isinstance(data, dict) or not isinstance(data.get("questions"), list):
        raise ValueError("Missing 'questions' list.")
    questions = data["questions"]
    if len(questions) != NUM_QUESTIONS:
        raise ValueError(f"Expected {NUM_QUESTIONS} questions, got {len(questions)}.")

    cleaned: list[dict[str, Any]] = []
    for item in questions:
        if not isinstance(item, dict):
            raise ValueError("A question is not an object.")
        question = str(item.get("question", "")).strip()
        options = item.get("options")
        explanation = str(item.get("explanation", "")).strip()
        if not question or not isinstance(options, list) or len(options) != NUM_OPTIONS:
            raise ValueError(f"Each question needs text and exactly {NUM_OPTIONS} options.")
        options = [str(option).strip() for option in options]
        if any(not option for option in options) or len(set(options)) != NUM_OPTIONS:
            raise ValueError("Options must be non-empty and unique.")
        correct = _match_option(str(item.get("correct_answer", "")), options)
        if correct is None:
            raise ValueError("correct_answer does not match any option.")
        cleaned.append(
            {
                "question": question,
                "options": options,
                "correct_answer": correct,
                "explanation": explanation or "No explanation was provided.",
            }
        )
    return {"questions": cleaned}


def generate_quiz(text: str) -> dict[str, list[dict[str, Any]]]:
    """Generate and validate a 3-question quiz. Retries once on a malformed reply."""
    prompt = f"Topic or passage:\n\"\"\"\n{text}\n\"\"\""
    last_problem = "unknown"
    for attempt in range(2):
        raw = generate_text(prompt, QUIZ_INSTRUCTION, json_mode=True, temperature=0.6)
        try:
            return validate_quiz(json.loads(clean_json_block(raw)))
        except (json.JSONDecodeError, ValueError) as exc:
            last_problem = str(exc)
            logger.warning("Quiz attempt %d was invalid: %s", attempt + 1, last_problem)
    raise GeminiError(
        "EduGenie could not build a valid quiz this time. Please try again, "
        "or use a slightly longer topic or passage."
    )
