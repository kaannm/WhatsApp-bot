#!/bin/bash

# WhatsApp Bot Deployment Script

echo "🚀 WhatsApp Bot Deployment Başlıyor..."

# Docker image'ı build et
echo "📦 Docker image build ediliyor..."
docker build -t whatsapp-bot .

# Eski container'ı durdur ve sil
echo "🔄 Eski container durduruluyor..."
docker-compose down

# Yeni container'ı başlat
echo "✅ Yeni container başlatılıyor..."
docker-compose up -d

# Health check
echo "🏥 Health check yapılıyor..."
sleep 10
curl -f http://localhost:3000/ || echo "❌ Health check başarısız"

echo "🎉 Deployment tamamlandı!"
echo "📱 Bot şu adreste çalışıyor: http://localhost:3000"
echo "🔍 Logları görmek için: docker-compose logs -f" 