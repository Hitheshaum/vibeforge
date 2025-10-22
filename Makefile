.PHONY: up down logs clean restart build help

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

up: ## Start all services
	docker compose up -d

build: ## Build all services
	docker compose build

down: ## Stop all services
	docker compose down

logs: ## Tail logs from all services
	docker compose logs -f

restart: down up ## Restart all services

clean: ## Stop services and remove generated apps and data
	docker compose down -v
	rm -rf work/*
	rm -rf data/*
	@echo "Cleaned work/ and data/ directories"

install: ## Install dependencies in all packages
	cd packages/shared && npm install
	cd services/control && npm install
	cd services/ui && npm install

lint: ## Run linters
	cd services/control && npm run lint
	cd services/ui && npm run lint

test: ## Run tests
	cd services/control && npm test
	cd services/ui && npm test
