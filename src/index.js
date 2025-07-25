const express = require('express');
const app = express();
const axios = require('axios');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const imagenService = require('./services/imagenService');
const whatsappService = require('./services/whatsappService');

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
const SYSTEM_PROMPT = `Sen samimi ve doğal bir WhatsApp form asistanısın. Kullanıcıyla arkadaşça konuş, kısa ve öz cümleler kullan. Amacın, kullanıcıdan sırasıyla ad, soyad, e-posta, telefon ve şehir bilgisini almak. 

ÖNEMLİ KURALLAR:
1. Kullanıcıdan gelen cevapta yeni bilgi varsa, bunu "YENİ_BİLGİ: [alan]: [değer]" formatında belirt
2. Eksik bilgiyi iste, mevcut bilgileri tekrar sorma
3. Konu dışı soruları kibarca reddet ve formu tamamlamaya yönlendir
4. Form tamamlanınca "FORM_TAMAMLANDI" yaz
5. Her adımda sadece bir bilgi iste
6. Sürekli "Merhaba" deme, çeşitli samimi ifadeler kullan
7. Kullanıcının adını öğrendikten sonra kullan

Örnek samimi ifadeler:
- "Harika! Şimdi soyadını öğrenebilir miyim?"
- "Teşekkürler! E-posta adresin nedir?"
- "Güzel! Telefon numaranı da alabilir miyim?"
- "Son olarak hangi şehirde yaşıyorsun?"
- "Mükemmel! Şimdi e-posta adresini öğrenebilir miyim?"

Örnek cevap formatı:
"Harika! Şimdi soyadını öğrenebilir miyim?"
veya
"YENİ_BİLGİ: Adı: Kaan
Teşekkürler Kaan! Şimdi soyadını öğrenebilir miyim?"`;

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

// Imagen 2 resim oluşturma endpoint'i
app.post('/generate-image', express.json(), async (req, res) => {
  try {
    const { prompt, phoneNumber, options = {} } = req.body;
    
    if (!prompt || !phoneNumber) {
      return res.status(400).json({ error: 'Prompt ve telefon numarası gerekli' });
    }

    // Resim oluştur
    const images = await imagenService.generateImage(prompt, options);
    
    if (images && images.length > 0) {
      // İlk resmi WhatsApp'a gönder
      await imagenService.sendImageToWhatsApp(phoneNumber, images[0].imageData, prompt);
      
      res.json({ 
        success: true, 
        message: 'Resim oluşturuldu ve gönderildi',
        imageCount: images.length 
      });
    } else {
      res.status(500).json({ error: 'Resim oluşturulamadı' });
    }
    
  } catch (error) {
    console.error('Resim oluşturma hatası:', error);
    res.status(500).json({ error: 'Resim oluşturma başarısız' });
  }
});
  
// Resim düzenleme endpoint'i
app.post('/edit-image', express.json(), async (req, res) => {
  try {
    const { imageData, prompt, phoneNumber, options = {} } = req.body;
    
    if (!imageData || !prompt || !phoneNumber) {
      return res.status(400).json({ error: 'Resim, prompt ve telefon numarası gerekli' });
      }
      
    // Resmi düzenle
    const images = await imagenService.editImage(imageData, prompt, options);
    
    if (images && images.length > 0) {
      await imagenService.sendImageToWhatsApp(phoneNumber, images[0].imageData, prompt);
      
      res.json({ 
        success: true, 
        message: 'Resim düzenlendi ve gönderildi' 
      });
    } else {
      res.status(500).json({ error: 'Resim düzenlenemedi' });
    }
    
  } catch (error) {
    console.error('Resim düzenleme hatası:', error);
    res.status(500).json({ error: 'Resim düzenleme başarısız' });
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
          
          // Form tamamlandıktan sonra kullanıcıya özel resim oluştur
          const userPrompt = `${session.answers.name} ${session.answers.surname} için özel bir profil resmi oluştur. ${session.answers.city} şehrinde yaşayan, modern ve profesyonel görünümlü bir kişi.`;
          
          try {
            const images = await imagenService.generateImage(userPrompt, {
              aspectRatio: '1:1',
              guidanceScale: 'high'
            });
            
            if (images && images.length > 0) {
              await imagenService.sendImageToWhatsApp(from, images[0].imageData, 
                `Merhaba ${session.answers.name}! Form tamamlandı ve senin için özel bir resim oluşturdum. 🎉`);
            }
          } catch (imageError) {
            console.error('Resim oluşturma hatası:', imageError);
            // Resim oluşturulamazsa sadece teşekkür mesajı gönder
            await sendWhatsappMessage(from, 'Teşekkürler! Bilgileriniz kaydedildi.');
          }
          
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

// WhatsApp mesaj gönderme fonksiyonu artık servis kullanıyor
async function sendWhatsappMessage(to, text) {
  await whatsappService.sendMessage(to, text);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu http://localhost:${PORT} üzerinden çalışıyor`);
}); 