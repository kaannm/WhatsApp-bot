const express = require('express');
const app = express();
const axios = require('axios');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Kullanıcı oturumlarını hafızada tutmak için basit bir obje
const sessions = {};
const questions = [
  { key: 'name', text: 'Adınızı yazar mısınız?' },
  { key: 'surname', text: 'Soyadınızı yazar mısınız?' },
  { key: 'email', text: 'E-posta adresinizi yazar mısınız?' },
  { key: 'phone', text: 'Telefon numaranızı yazar mısınız?' },
  { key: 'city', text: 'Hangi şehirde yaşıyorsunuz?' }
];

// Firebase Admin başlat (idempotent)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL
    })
  });
  console.log('Firebase Admin başlatıldı!');
}
const db = admin.firestore();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const gemini = new GoogleGenerativeAI(GEMINI_API_KEY);

// Kullanıcı başına 24 saatte 50 Gemini mesaj limiti için sayaç
const geminiLimits = {};
const GEMINI_LIMIT = 50;
const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 saat

// Tam asistan akışı için sistem promptu
const SYSTEM_PROMPT = `Sen bir WhatsApp form asistanısın. Kullanıcıyla samimi, doğal ve kısa cümlelerle konuş. Amacın, kullanıcıdan sırasıyla ad, soyad, e-posta, telefon ve şehir bilgisini almak. 

ÖNEMLİ KURALLAR:
1. Kullanıcıdan gelen cevapta yeni bilgi varsa, bunu "YENİ_BİLGİ: [alan]: [değer]" formatında belirt
2. Eksik bilgiyi iste, mevcut bilgileri tekrar sorma
3. Konu dışı soruları kibarca reddet ve formu tamamlamaya yönlendir
4. Form tamamlanınca "FORM_TAMAMLANDI" yaz
5. Her adımda sadece bir bilgi iste

Örnek cevap formatı:
"Merhaba! Adını aldım. Şimdi soyadını öğrenebilir miyim?"
veya
"YENİ_BİLGİ: Adı: Kaan
Merhaba Kaan! Şimdi soyadını öğrenebilir miyim?"`;

const formFields = [
  { key: 'name', label: 'Adı' },
  { key: 'surname', label: 'Soyadı' },
  { key: 'email', label: 'E-posta' },
  { key: 'phone', label: 'Telefon' },
  { key: 'city', label: 'Şehir' }
];

function getFormState(session) {
  let state = '';
  for (const field of formFields) {
    if (session.answers[field.key]) {
      state += `${field.label}: ${session.answers[field.key]}\n`;
    }
  }
  return state.trim();
}

async function askGemini(prompt) {
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

function canUseGemini(userId) {
  const now = Date.now();
  if (!geminiLimits[userId] || now - geminiLimits[userId].start > LIMIT_WINDOW_MS) {
    geminiLimits[userId] = { count: 0, start: now };
  }
  if (geminiLimits[userId].count >= GEMINI_LIMIT) return false;
  geminiLimits[userId].count++;
  return true;
}

app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Railway Express çalışıyor!' });
});

app.get('/webhook', (req, res) => {
  const verify_token = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === verify_token) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', express.json(), async (req, res) => {
  console.log('POST /webhook çağrıldı');
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (message) {
    const from = message.from;
    if (!sessions[from]) {
      sessions[from] = { answers: {}, awaitingAnswer: false };
    }
    const session = sessions[from];
    if (!canUseGemini(from)) {
      await sendWhatsappMessage(from, 'Günlük ücretsiz sohbet hakkınız doldu, yarın tekrar deneyin.');
      return res.sendStatus(200);
    }
    // Kullanıcıdan gelen cevabı ve formun mevcut durumunu Gemini'ye ilet
    let userInput = message.text?.body || '';
    let formState = getFormState(session);
    let nextField = formFields.find(f => !session.answers[f.key]);
    let prompt = `${SYSTEM_PROMPT}\n\nŞu ana kadar alınan bilgiler:\n${formState || 'Henüz bilgi yok.'}\n\nKullanıcıdan beklenen bilgi: ${nextField ? nextField.label : 'YOK'}\nKullanıcı cevabı: ${userInput}`;
    try {
      const geminiResponse = (await askGemini(prompt)).trim();
      console.log('Gemini asistan cevabı:', geminiResponse);
      
      // YENİ_BİLGİ formatını kontrol et
      const newInfoMatch = geminiResponse.match(/YENİ_BİLGİ:\s*([^\n]+)/i);
      if (newInfoMatch) {
        const newInfo = newInfoMatch[1];
        for (const field of formFields) {
          const regex = new RegExp(`${field.label}:\\s*([^\n]+)`, 'i');
          const match = newInfo.match(regex);
          if (match) {
            session.answers[field.key] = match[1].trim();
            console.log(`Yeni bilgi kaydedildi: ${field.key} = ${match[1].trim()}`);
          }
        }
      }
      
      // Eğer form tamamlandıysa
      if (/FORM_TAMAMLANDI/i.test(geminiResponse)) {
        try {
          await db.collection('users').add({
            phone: from,
            ...session.answers,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          await sendWhatsappMessage(from, 'Teşekkürler! Bilgileriniz kaydedildi.');
        } catch (err) {
          console.error('Firestore kayıt hatası:', err);
          await sendWhatsappMessage(from, 'Kaydederken bir hata oluştu. Lütfen tekrar deneyin.');
        }
        delete sessions[from];
      } else {
        // Kullanıcıya Gemini'nin cevabını ilet (YENİ_BİLGİ kısmını çıkar)
        const cleanResponse = geminiResponse.replace(/YENİ_BİLGİ:.*$/gim, '').trim();
        await sendWhatsappMessage(from, cleanResponse);
      }
    } catch (err) {
      console.error('Gemini API hatası:', err);
      await sendWhatsappMessage(from, 'Servisimiz şu anda müsait değil, lütfen biraz sonra tekrar deneyin.');
      return res.sendStatus(200);
    }
  }
  res.sendStatus(200);
});

async function sendWhatsappMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu http://localhost:${PORT} üzerinden çalışıyor`);
}); 