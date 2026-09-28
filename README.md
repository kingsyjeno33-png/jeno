# EduGenie – Google Gemini Powered Learning Assistant

EduGenie is an AI learning assistant for students and self-learners. It runs locally with
**FastAPI** and a plain **HTML / CSS / JavaScript** front end, and uses **Google Gemini** for all AI features.

## Features

- **Ask Question** – short, accurate answers with examples.
- **Explain Topic** – definition, main points, easy example and summary, shown as section cards.
- **Generate Quiz** – exactly 3 multiple-choice questions (4 options each). Check each answer, read the explanation, then see your score.
- **Summarize** – revision-friendly summaries that add nothing new.
- **Learning Path** – beginner-to-advanced roadmap with practice, resources and timeline, tailored to your level.
- Light and dark themes, mobile-friendly layout, copy button, example prompts, `Ctrl + Enter` to generate.

## Technology stack

Python 3.10+, FastAPI, Uvicorn, Google Gemini (`google-genai` SDK), Jinja2, python-dotenv, Pydantic, vanilla JavaScript.

## Folder structure

```
EduGenie/
├── main.py                 FastAPI app, routes, validation, error handling
├── gemini_client.py        Shared Gemini helper (only file that talks to Gemini)
├── qna.py                  answer_question()
├── explanation_module.py   explain_topic()  (optional local LaMini-Flan-T5, Gemini fallback)
├── quiz_module.py          generate_quiz(), clean_json_block(), validate_quiz()
├── summary_module.py       summarize_text()
├── learning_path.py        get_learning_recommendations()
├── requirements.txt
├── .env / .env.example
├── .gitignore
├── templates/index.html
└── static/ (style.css, script.js)
```

## Installation

```bash
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

pip install -r requirements.txt
```

## Gemini API setup

1. Create a free key at <https://aistudio.google.com/apikey>.
2. Open the `.env` file and replace the placeholder:

```
GEMINI_API_KEY=your_real_key_here
```

Optional settings: `GEMINI_MODEL` (default `gemini-2.5-flash`) and `USE_LOCAL_MODEL=true`
(uses a local LaMini-Flan-T5 model for explanations; needs `transformers` and `torch`, and falls back to Gemini if unavailable).

## How to run

```bash
uvicorn main:app --reload
```

Open <http://127.0.0.1:8000>.

## API endpoints

| Method | Path | Body | Success key |
|--------|------|------|-------------|
| POST | `/qa` | `{"question": "..."}` | `answer` |
| POST | `/explain` | `{"topic": "..."}` | `explanation` |
| POST | `/quiz` | `{"text": "..."}` | `quiz` |
| POST | `/summarize` | `{"text": "..."}` | `summary` |
| POST | `/learn/recommendations` | `{"topic": "...", "level": "Beginner"}` | `learning_path` |

Every success response is `{"success": true, "<key>": ..., "result": ...}`.
Every error is `{"success": false, "error": "Readable message"}`.

## Example requests

```bash
curl -X POST http://127.0.0.1:8000/qa -H "Content-Type: application/json" \
  -d '{"question": "What is photosynthesis?"}'

curl -X POST http://127.0.0.1:8000/learn/recommendations -H "Content-Type: application/json" \
  -d '{"topic": "SQL", "level": "Beginner"}'
```

## Testing checklist

1. Ask: "What is photosynthesis?" – clear answer.
2. Explain: "Explain inheritance in OOP." – four sections with an example.
3. Quiz: "Photosynthesis" – 3 questions, 4 options each; score shown after all are checked.
4. Summarize: paste a long paragraph – short bullet summary.
5. Learning Path: Python, Beginner – full roadmap.
6. Leave the input empty – "Please enter some text before continuing."

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "The Gemini API key is missing" | Put your real key in `.env`, then restart Uvicorn. |
| "API key was rejected" | Regenerate the key in Google AI Studio. |
| "Model ... was not found" | Set `GEMINI_MODEL` in `.env` to a currently available model. |
| "Too many requests" | Free-tier rate limit. Wait a minute and retry. |
| `ModuleNotFoundError` | Activate the virtual environment and run `pip install -r requirements.txt`. |
| Fonts look different | Fonts load from Google Fonts; offline, the page uses system fonts. |

## Future improvements

User accounts and saved history, streaming responses, PDF/notes upload, adjustable quiz length and difficulty,
spaced-repetition flashcards, multi-language support, swappable AI providers through `gemini_client.py`.
