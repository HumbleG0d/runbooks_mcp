FROM node:18-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependencias
RUN npm install

# Copiar código fuente
COPY src/ ./src/

# Compilar TypeScript
RUN npm run build

# Puerto del HTTP Bridge
EXPOSE 3001

# Comando para ejecutar el HTTP Bridge
CMD ["node", "dist/http-bridge.js"]
