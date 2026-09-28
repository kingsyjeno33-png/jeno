"""Shared Gemini helper used by every EduGenie module.

All calls to Google Gemini go through `generate_text()`, so swapping the AI
model or provider later only means editing this one file.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# Load GEMINI_API_KEY (and optional settings) from the .env next to this file.
load_dotenv(Path(__file__).resolve().parent / ".env")

logger = logging.getLogger("edugenie")

DEFAULT_MODEL = "gemini-2.5-flash"
PLACEHOLDER_KEYS = {"", "YOUR_API_KEY_HERE", "YOUR_API_KEY"}

# Rules shared by every feature (spec section 21).
BASE_RULES = (
    "You are EduGenie, an educational assistant for students and self-learners. "
    "Use simple language, be accurate, and avoid unnecessary complexity. "
    "Use short examples when they help. Organize answers with headings and bullet points "
    "where it makes them easier to read. Adapt to the learner's level. "
    "Never invent sources, quotes, statistics, or URLs. "
    "If you are unsure about something, say so clearly. "
    "Do not use tables."
)


class GeminiError(Exception):
    """An error whose message is safe to show to the student."""

    def __init__(self, user_message: str, status_code: int = 502) -> None:
        super().__init__(user_message)
        self.user_message = user_message
        self.status_code = status_code


_client = None  # created lazily so the server can start without a key


def get_model_name() -> str:
    return os.getenv("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def _get_client():
    """Create (once) and return the Gemini client."""
    global _client
    if _client is not None:
        return _client

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if api_key in PLACEHOLDER_KEYS:
        raise GeminiError(
            "The Gemini API key is missing. Add GEMINI_API_KEY to the .env file "
            "and restart the server.",
            status_code=503,
        )

    try:
        from google import genai  # provided by the `google-genai` package
    except ImportError as exc:
        raise GeminiError(
            "The Google Gemini SDK is not installed. Run: pip install -r requirements.txt",
            status_code=503,
        ) from exc

    _client = genai.Client(api_key=api_key)
    return _client


def _friendly_message(exc: Exception) -> tuple[str, int]:
    """Translate SDK errors into safe, useful messages (no stack traces)."""
    text = str(exc)
    upper = text.upper()
    if "API_KEY_INVALID" in upper or "API KEY NOT VALID" in upper or "UNAUTHENTICATED" in upper:
        return "The Gemini API key was rejected. Check GEMINI_API_KEY in your .env file.", 503
    if "PERMISSION_DENIED" in upper:
        return "The Gemini API key does not have permission to use this model.", 503
    if "429" in text or "RESOURCE_EXHAUSTED" in upper:
        return "Gemini is receiving too many requests right now. Wait a moment and try again.", 429
    if "NOT_FOUND" in upper or "404" in text:
        return (
            f"The model '{get_model_name()}' was not found. "
            "Set GEMINI_MODEL in .env to a currently available Gemini model.",
            503,
        )
    if "503" in text or "UNAVAILABLE" in upper or "OVERLOADED" in upper:
        return "Gemini is busy at the moment. Please try again in a few seconds.", 503
    if "TIMEOUT" in upper or "TIMED OUT" in upper or "CONNECT" in upper:
        return "EduGenie could not reach Gemini. Check your internet connection and try again.", 502
    return "EduGenie could not generate a response right now. Please try again.", 502


def generate_text(
    prompt: str,
    system_instruction: str,
    *,
    json_mode: bool = False,
    temperature: float = 0.4,
) -> str:
    """Send a prompt to Gemini and return the response text.

    Raises GeminiError with a student-friendly message on any failure.
    """
    client = _get_client()

    from google.genai import types

    config = types.GenerateContentConfig(
        system_instruction=f"{BASE_RULES}\n\n{system_instruction}",
        temperature=temperature,
        response_mime_type="application/json" if json_mode else None,
    )

    try:
        response = client.models.generate_content(
            model=get_model_name(),
            contents=prompt,
            config=config,
        )
        text: Optional[str] = response.text
    except GeminiError:
        raise
    except Exception as exc:  # the SDK raises many different error types
        logger.exception("Gemini request failed")
        message, status = _friendly_message(exc)
        raise GeminiError(message, status) from exc

    if not text or not text.strip():
        raise GeminiError(
            "Gemini returned an empty response. Please rephrase your input and try again."
        )
    return text.strip()
