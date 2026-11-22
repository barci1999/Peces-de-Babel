FROM node:22-alpine

WORKDIR /app

# Copiamos solo archivos de dependencias primero para aprovechar la caché de Docker
COPY package.json package-lock.json* ./

# Si existe package-lock.json lo usamos; si aún no lo tienes, npm install funciona igual
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# El resto del código se montará por volumen en docker-compose, pero copiarlo aquí
# hace que la imagen también sea autosuficiente si haces pruebas sin volumen
COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]