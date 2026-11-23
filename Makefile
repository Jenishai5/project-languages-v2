.PHONY: install db migrate import api test down

install:
	python3 -m venv .venv
	.venv/bin/pip install -e ".[dev]"

db:
	docker compose up -d --wait

migrate:
	.venv/bin/alembic upgrade head

import:
	.venv/bin/python -m langapp.cli import --source spa --targets eng rus --pages $(or $(PAGES),2)

api:
	.venv/bin/uvicorn langapp.api.main:app --reload --port 8000

test:
	.venv/bin/pytest -q

down:
	docker compose down
