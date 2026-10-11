FROM golang:alpine AS builder

WORKDIR /src

RUN apk add --no-cache ca-certificates tzdata

COPY go.mod ./
RUN go mod download || true

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /opsgraf cmd/opsgraf/main.go

FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -u 10001 opsgraf && \
    mkdir -p /app/dashboard/backups && \
    chown -R opsgraf:opsgraf /app

COPY --from=builder /opsgraf /app/opsgraf
COPY --chown=opsgraf:opsgraf dashboard /app/dashboard

USER opsgraf

ENV LISTEN_PORT="8080"
ENV LISTEN_ADDRESS="0.0.0.0"
ENV PROMETHEUS_ENDPOINT="http://127.0.0.1:9090"
ENV TIMEZONE="UTC"
ENV ADMIN_USER="admin"
ENV ADMIN_PASSWORD="admin"
ENV DASHBOARD_DIR="/app/dashboard"

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["/app/opsgraf"]
