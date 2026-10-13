FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration production

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
