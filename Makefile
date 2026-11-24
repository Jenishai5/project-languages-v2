.PHONY: install db migrate import import-builder import-words api frontend test down

install:
	python3 -m venv .venv
	.venv/bin/pip install -e ".[dev]"

db:
	docker compose up -d --wait

migrate:
	.venv/bin/alembic upgrade head

import:
	.venv/bin/python -m langapp.cli import --source spa --targets eng rus --pages $(or $(PAGES),2)

import-builder:
	.venv/bin/python -m langapp.cli import --source eng --targets spa rus --max-words 8 --with-audio --pages $(or $(PAGES),4)

import-words:
	.venv/bin/python -m langapp.cli import-words

api:
	.venv/bin/uvicorn langapp.api.main:app --reload --port 8000

frontend:
	cd frontend && npm install && npm run dev

test:
	.venv/bin/pytest -q

down:
	docker compose down
