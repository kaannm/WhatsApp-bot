const express = require('express');
const bodyParser = require('body-parser');
const app = express();

const VERIFY_TOKEN = "whatsapp-bot-2024-secret-token";

app.use(bodyParser.json());

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Test endpoint çalışıyor',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: 'Bot çalışıyor'
  });
});

// ✅ Webhook Doğrulama Kısmı
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("Webhook doğrulandı.");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 🔁 Webhook POST (mesajları almak için)
app.post('/webhook', (req, res) => {
  console.log('Gelen mesaj:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Sunucu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} üzerinden çalışıyor`);
}); 