# Node.js 18 Alpine image kullan
FROM node:18-alpine

# Çalışma dizinini ayarla
WORKDIR /app

# Package.json ve package-lock.json dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm ci --only=production

# Uygulama dosyalarını kopyala
COPY . .

# Port 3000'i aç
EXPOSE 3000

# Uygulamayı başlat
CMD ["npm", "start"] 