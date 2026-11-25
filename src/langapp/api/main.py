from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse

from langapp.api.routes import agents, games, lessons, mnemonics, progress, sentences, system
from langapp.errors import AppError

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

app = FastAPI(
    title="Language App API",
    version="0.1.0",
    description="Spanish sentences with English and Russian translations, imported from Tatoeba.",
)
@app.exception_handler(AppError)
def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})


app.include_router(system.router)
app.include_router(mnemonics.router)
app.include_router(sentences.router)
app.include_router(games.router)
app.include_router(progress.router)
app.include_router(lessons.router)
app.include_router(agents.router)


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")
