.PHONY: install install-mcp db migrate import import-builder import-words import-concepts build-lessons api frontend test down lint ai-usage mcp

install:
	python3 -m venv .venv
	.venv/bin/pip install -e ".[dev]"

install-mcp:
	.venv/bin/pip install -e ".[dev,mcp]"

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

import-concepts:
	.venv/bin/python -m langapp.cli import-concepts

build-lessons:
	.venv/bin/python -m langapp.cli build-lessons --learning eng --natives spa rus --lessons $(or $(LESSONS),10)

api:
	.venv/bin/uvicorn langapp.api.main:app --reload --port 8000

frontend:
	cd frontend && npm install && npm run dev

test:
	.venv/bin/pytest -q

lint:
	.venv/bin/ruff check src tests

ai-usage:
	.venv/bin/python -m langapp.cli ai-usage --days $(or $(DAYS),7)

mcp:
	.venv/bin/python -m langapp.mcp_server

down:
	docker compose down
