FROM golang:1.26-alpine AS build
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/doubo-api ./cmd/server
FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata && adduser -D -u 10001 doubo
WORKDIR /app
COPY --from=build /out/doubo-api /app/doubo-api
COPY --chown=doubo:doubo media /app/media
RUN mkdir -p /app/media/uploads && chown doubo:doubo /app/media/uploads
USER doubo
ENV HTTP_ADDR=0.0.0.0:5173 MEDIA_DIR=/app/media
EXPOSE 5173
ENTRYPOINT ["/app/doubo-api"]
