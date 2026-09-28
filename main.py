"""EduGenie - Google Gemini powered learning assistant (FastAPI entry point).

Run with:  uvicorn main:app --reload
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Callable

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, field_validator

from explanation_module import explain_topic
from gemini_client import GeminiError  # also loads .env
from learning_path import VALID_LEVELS, get_learning_recommendations
from qna import answer_question
from quiz_module import generate_quiz
from summary_module import summarize_text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("edugenie")

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="EduGenie", description="Google Gemini powered learning assistant")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# Maximum characters accepted per feature.
LIMITS = {"question": 1000, "topic": 300, "quiz": 8000, "summary": 20000, "path_topic": 200}
EMPTY_MESSAGE = "Please enter some text before continuing."


def _clean(value: str, limit: int, label: str) -> str:
    """Trim the input and enforce it is not empty or too long."""
    value = value.strip()
    if not value:
        raise ValueError(EMPTY_MESSAGE)
    if len(value) > limit:
        raise ValueError(f"{label} is too long. Please keep it under {limit:,} characters.")
    return value


# ---------- Request models ----------
class QuestionRequest(BaseModel):
    question: str

    @field_validator("question")
    @classmethod
    def check(cls, v: str) -> str:
        return _clean(v, LIMITS["question"], "The question")


class ExplainRequest(BaseModel):
    topic: str

    @field_validator("topic")
    @classmethod
    def check(cls, v: str) -> str:
        return _clean(v, LIMITS["topic"], "The topic")


class QuizRequest(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def check(cls, v: str) -> str:
        return _clean(v, LIMITS["quiz"], "The text")


class SummarizeRequest(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def check(cls, v: str) -> str:
        return _clean(v, LIMITS["summary"], "The text")


class LearningPathRequest(BaseModel):
    topic: str
    level: str = "Beginner"

    @field_validator("topic")
    @classmethod
    def check_topic(cls, v: str) -> str:
        return _clean(v, LIMITS["path_topic"], "The topic")

    @field_validator("level")
    @classmethod
    def check_level(cls, v: str) -> str:
        level = v.strip().title()
        if level not in VALID_LEVELS:
            raise ValueError("Level must be Beginner, Intermediate or Advanced.")
        return level


# ---------- Helpers ----------
def _error(message: str, status_code: int) -> JSONResponse:
    return JSONResponse({"success": False, "error": message}, status_code=status_code)


def _respond(key: str, func: Callable[..., Any], *args: Any) -> JSONResponse:
    """Run a feature module and wrap its result (or error) in clean JSON."""
    try:
        result = func(*args)
        return JSONResponse({"success": True, key: result, "result": result})
    except GeminiError as exc:
        return _error(exc.user_message, exc.status_code)
    except Exception:  # never leak a stack trace to the browser
        logger.exception("Unexpected error in %s", getattr(func, "__name__", "handler"))
        return _error("EduGenie could not generate a response right now. Please try again.", 500)


# ---------- Error handlers ----------
@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    message = EMPTY_MESSAGE
    if errors and errors[0].get("type") != "missing":
        message = str(errors[0].get("msg", message)).removeprefix("Value error, ")
    return _error(message, 422)


@app.exception_handler(Exception)
async def unexpected_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error")
    return _error("Something went wrong on the server. Please try again.", 500)


# ---------- Routes ----------
@app.get("/", response_class=HTMLResponse)
def home(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html")


@app.post("/qa")
def qa(payload: QuestionRequest) -> JSONResponse:
    return _respond("answer", answer_question, payload.question)


@app.post("/explain")
def explain(payload: ExplainRequest) -> JSONResponse:
    return _respond("explanation", explain_topic, payload.topic)


@app.post("/quiz")
def quiz(payload: QuizRequest) -> JSONResponse:
    return _respond("quiz", generate_quiz, payload.text)


@app.post("/summarize")
def summarize(payload: SummarizeRequest) -> JSONResponse:
    return _respond("summary", summarize_text, payload.text)


@app.post("/learn/recommendations")
def learn_recommendations(payload: LearningPathRequest) -> JSONResponse:
    return _respond("learning_path", get_learning_recommendations, payload.topic, payload.level)
