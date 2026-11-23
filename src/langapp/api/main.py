from fastapi import FastAPI

from langapp.api.routes import sentences, system

app = FastAPI(
    title="Language App API",
    version="0.1.0",
    description="Spanish sentences with English and Russian translations, imported from Tatoeba.",
)
app.include_router(system.router)
app.include_router(sentences.router)
