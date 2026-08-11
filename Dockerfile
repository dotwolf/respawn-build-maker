FROM golang:1.26.1-alpine AS builder
WORKDIR /app

# Copy root level modules if they exist
COPY go.mod go.sum ./
RUN go mod download

# Copy the entire monorepo source code
COPY . .

# Build from the specific api directory path
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/api ./apps/api/cmd/main.go

# Build goose for running migrations at deploy time
RUN GOBIN=/app/bin CGO_ENABLED=0 GOOS=linux go install github.com/pressly/goose/v3/cmd/goose@latest

FROM alpine:latest
RUN apk --no-cache add ca-certificates

# Set a clean working directory
WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/bin/api ./api
COPY --from=builder /app/bin/goose ./goose
COPY --from=builder /app/apps/api/migrations ./migrations

EXPOSE 3001
CMD ["./api"]