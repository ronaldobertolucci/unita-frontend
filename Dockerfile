FROM node:20-alpine
WORKDIR /app
COPY package*.json ./

# Instalar dependências de produção + http-server
RUN npm ci --only=production && \
    npm install -g http-server

COPY . .
RUN npm run build -- --configuration production

EXPOSE 4200

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]