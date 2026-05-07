#!/bin/sh

# Criar arquivo JavaScript com variáveis de ambiente
mkdir -p /app/dist/unita-frontend/browser/assets

cat > /app/dist/unita-frontend/browser/assets/env.js <<EOF
window.__env = {
  apiUrl: '${API_URL:-/api}',
  production: ${PRODUCTION:-true}
};
EOF

echo "Variáveis de ambiente configuradas:"
cat /app/dist/unita-frontend/browser/assets/env.js

# Iniciar servidor
cd /app/dist/unita-frontend/browser
http-server -p 4200 -c-1 --proxy http://localhost:4200?