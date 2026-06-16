# Imagen base de Node.js (versión estable)
FROM node:22-alpine

# Carpeta de trabajo dentro del contenedor
WORKDIR /app

# Copiamos solo los archivos de dependencias primero (optimización de caché)
COPY package*.json ./

# Instalamos dependencias
RUN npm install

# Copiamos el resto del código
COPY . .

# Exponemos el puerto de Next.js
EXPOSE 3000

# Comando para arrancar en modo desarrollo
CMD ["npm", "run", "dev"]
