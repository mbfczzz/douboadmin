FROM node:22-alpine AS build
WORKDIR /workspace/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
COPY scripts/ ../scripts/
RUN npm run build
FROM nginx:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/web/dist /usr/share/nginx/html
EXPOSE 80
