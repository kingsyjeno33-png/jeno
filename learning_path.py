"""Personalized learning path module."""

from __future__ import annotations

from gemini_client import generate_text

VALID_LEVELS = ("Beginner", "Intermediate", "Advanced")

LEARNING_PATH_INSTRUCTION = (
    "Create a structured learning path for the topic. Use exactly these second-level "
    "markdown headings, in this order, and nothing before the first heading:\n"
    "## Topic Introduction\n(2-3 sentences: what it is and why it matters)\n"
    "## Beginner Concepts\n(bullet list)\n"
    "## Intermediate Concepts\n(bullet list)\n"
    "## Advanced Concepts\n(bullet list)\n"
    "## Suggested Learning Order\n(a numbered list of 5-8 steps)\n"
    "## Practice Activities\n(4-6 bullet points: exercises or mini projects)\n"
    "## Suggested Resources\n(bullets naming well-known kinds of resources, such as official "
    "documentation, established platforms, or classic textbooks. Do NOT invent titles, "
    "authors, or URLs; if unsure, describe the type of resource instead)\n"
    "## Estimated Timeline\n(a realistic week-by-week or phase-by-phase plan as bullets, "
    "assuming about 5-8 study hours per week)\n"
    "Keep bullets short. Adapt depth, pacing and emphasis to the learner's current level."
)


def get_learning_recommendations(topic: str, level: str) -> str:
    """Return a beginner-to-advanced learning path tailored to the learner's level."""
    if level not in VALID_LEVELS:
        level = "Beginner"
    prompt = (
        f"Topic: {topic}\n"
        f"Learner's current level: {level}\n"
        "Cover the full beginner-to-advanced journey, but tell the learner where they "
        f"should start and what to focus on as a {level.lower()}."
    )
    return generate_text(prompt, LEARNING_PATH_INSTRUCTION, temperature=0.5)
