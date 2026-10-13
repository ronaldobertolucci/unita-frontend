# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Reuse downloaded packages when the lockfile changes.
RUN --mount=type=cache,id=unita-frontend-npm,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund --prefer-offline
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY src ./src
COPY public ./public
# Keep Angular's incremental cache across source changes.
RUN --mount=type=cache,id=unita-frontend-angular,target=/app/.angular/cache,sharing=locked \
    npm run build -- --configuration production

FROM nginx:stable-alpine
ENV API_UPSTREAM=http://app:8080 \
    API_URL=/api \
    PRODUCTION=true \
    NGINX_ENVSUBST_FILTER=^API_UPSTREAM$
COPY --from=build /app/dist/unita-frontend/browser /usr/share/nginx/html
COPY deploy/default.conf.template /etc/nginx/templates/default.conf.template
COPY start.sh /docker-entrypoint.d/15-unita-env.sh
RUN chmod +x /docker-entrypoint.d/15-unita-env.sh
EXPOSE 4200
