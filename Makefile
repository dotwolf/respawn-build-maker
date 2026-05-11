include .env
export
DB_URL=postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:$(DB_PORT)/$(POSTGRES_DB)?sslmode=$(DB_SSLMODE)

migrate-create:
	cd apps/api && goose -dir migrations create $(name) sql

migrate-up:
	cd apps/api && goose -dir migrations postgres "$(DB_URL)" up

migrate-down:
	cd apps/api && goose -dir migrations postgres "$(DB_URL)" down

migrate-status:
	cd apps/api && goose -dir migrations postgres "$(DB_URL)" status

migrate-reset:
	cd apps/api && goose -dir migrations postgres "$(DB_URL)" reset

#make migrate-create name=add_posts_table
#make migrate-up
#make migrate-status