FROM node:22-alpine

WORKDIR /app

# Copiamos solo archivos de dependencias primero para aprovechar la caché de Docker
COPY package.json package-lock.json* ./

# Instalamos todas las dependencias (incluidas devDependencies como @types/node y tsx para desarrollo)
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi

# El resto del código se montará por volumen en docker-compose, pero copiarlo aquí
# hace que la imagen también sea autosuficiente si haces pruebas sin volumen
COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]