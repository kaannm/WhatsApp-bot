FROM node:18-alpine

# Çalışma dizinini ayarla
WORKDIR /app

# Package.json ve package-lock.json kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm ci --only=production

# Uygulama kodlarını kopyala
COPY src/ ./src/
COPY firebase-key.json ./

# Logs klasörü oluştur
RUN mkdir -p logs

# Port aç
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Uygulamayı başlat
CMD ["npm", "start"] 