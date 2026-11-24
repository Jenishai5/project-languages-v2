from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from langapp.api.routes import games, lessons, progress, sentences, system

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

app = FastAPI(
    title="Language App API",
    version="0.1.0",
    description="Spanish sentences with English and Russian translations, imported from Tatoeba.",
)
app.include_router(system.router)
app.include_router(sentences.router)
app.include_router(games.router)
app.include_router(progress.router)
app.include_router(lessons.router)


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")
