FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

EXPOSE 5173

# --host 0.0.0.0 es clave para que el servidor de Vite sea accesible desde fuera del contenedor
CMD ["npm", "run", "dev"]