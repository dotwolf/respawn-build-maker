FROM golang:1.26.1-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
WORKDIR /app/apps/api
RUN CGO_ENABLED=0 GOOS=linux go build -o api ./cmd/main.go
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/apps/api/api .
EXPOSE 3001
CMD ["./api"]