# financial-ops-platform — developer Makefile
#
# Thin wrappers over the canonical commands listed in CLAUDE.md so newcomers
# (and CI) have one obvious entry point per task. Every target shells out to
# the same tool the project has always used; nothing is reimplemented here.

.PHONY: help dev api web test test-py test-web migrate i18n-check prod-preflight \
        deploy-orb stop-orb logs-orb

# Default target prints the help block.
.DEFAULT_GOAL := help

PYTHON ?= python3

help:
	@echo "financial-ops-platform — make targets"
	@echo
	@echo "  make api               Start FastAPI on :8000 with --reload"
	@echo "  make web               Start Next.js dev server on :3000 (Turbopack)"
	@echo "  make test              Run BOTH backend pytest and frontend vitest"
	@echo "  make test-py           pytest tests/"
	@echo "  make test-web          cd web && npm test"
	@echo "  make migrate           alembic upgrade head"
	@echo "  make i18n-check        Strict i18n parity + t() reference check"
	@echo "  make prod-preflight    Boot Settings under ENVIRONMENT=production"
	@echo "                         and assert no production-blocking config drift."
	@echo "                         Honors the env vars in scripts/prod_preflight.py."
	@echo "  make deploy-orb        FRONTEND_HOST_PORT=3001 docker compose up -d --build"
	@echo "  make stop-orb          docker compose down"
	@echo "  make logs-orb          docker compose logs -f --tail=100"

api:
	$(PYTHON) -m uvicorn apps.api.main:app --reload

web:
	cd web && npm run dev

test: test-py test-web

test-py:
	$(PYTHON) -m pytest tests/

test-web:
	cd web && npm test

migrate:
	alembic upgrade head

i18n-check:
	cd web && node scripts/i18n-check.mjs

# Phase 0.3 closeout — invokes the canonical CLI. Exit 0 iff prod config is
# safe to ship; non-zero with a structured failure list otherwise.
prod-preflight:
	$(PYTHON) scripts/prod_preflight.py

deploy-orb:
	FRONTEND_HOST_PORT=3001 docker compose up -d --build

stop-orb:
	docker compose down

logs-orb:
	docker compose logs -f --tail=100
