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

// Resim oluşturma için ek sorular
const imageQuestions = [
  { key: 'bestFriendName', text: 'En yakın arkadaşının adı ne?' },
  { key: 'favoriteActivity', text: 'En çok ne yapmayı seversin?' },
  { key: 'friendFavoriteActivity', text: 'En yakın arkadaşın ne yapmayı sever?' },
  { key: 'dreamDestination', text: 'En yakın arkadaşınla hangi ülkeye/nereye gitmek istersin?' },
  { key: 'favoriteStyle', text: 'Hangi tarzı seversin? (casual, sporty, elegant, bohemian, modern)' }
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
const SYSTEM_PROMPT = `Sen samimi ve doğal bir WhatsApp form asistanısın. Kullanıcıyla arkadaşça konuş, kısa ve öz cümleler kullan. 

İKİ AŞAMALI FORM:
1. AŞAMA: Temel bilgiler (ad, soyad, e-posta, telefon, şehir)
2. AŞAMA: Resim oluşturma bilgileri (arkadaş, aktiviteler, hayaller)

ÖNEMLİ KURALLAR:
1. Kullanıcıdan gelen cevapta yeni bilgi varsa, bunu "YENİ_BİLGİ: [alan]: [değer]" formatında belirt
2. Eksik bilgiyi iste, mevcut bilgileri tekrar sorma
3. Konu dışı soruları kibarca reddet ve formu tamamlamaya yönlendir
4. İlk form tamamlanınca "FORM_TAMAMLANDI" yaz
5. Resim formu tamamlanınca "IMAGE_FORM_TAMAMLANDI" yaz
6. Her adımda sadece bir bilgi iste
7. Sürekli "Merhaba" deme, çeşitli samimi ifadeler kullan
8. Kullanıcının adını öğrendikten sonra kullan

Örnek samimi ifadeler:
- "Harika! Şimdi soyadını öğrenebilir miyim?"
- "Teşekkürler! E-posta adresin nedir?"
- "Güzel! Telefon numaranı da alabilir miyim?"
- "Son olarak hangi şehirde yaşıyorsun?"
- "Mükemmel! Şimdi resim oluşturmak için birkaç soru daha soracağım."
- "Harika! En yakın arkadaşının adı ne?"

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

const imageFormFields = [
  { key: 'bestFriendName', label: 'En Yakın Arkadaş' },
  { key: 'favoriteActivity', label: 'Favori Aktivite' },
  { key: 'friendFavoriteActivity', label: 'Arkadaşın Favori Aktivitesi' },
  { key: 'dreamDestination', label: 'Hayal Ülke/Yer' },
  { key: 'favoriteStyle', label: 'Favori Tarz' }
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

function getImageFormState(session) {
  let state = '';
  for (const field of imageFormFields) {
    if (session.imageAnswers && session.imageAnswers[field.key]) {
      state += `${field.label}: ${session.imageAnswers[field.key]}\n`;
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
      sessions[from] = { 
        answers: {}, 
        imageAnswers: {},
        awaitingAnswer: false,
        formStage: 'basic' // 'basic' veya 'image'
      };
    }
    const session = sessions[from];
    if (!canUseGemini(from)) {
      await sendWhatsappMessage(from, 'Günlük ücretsiz sohbet hakkınız doldu, yarın tekrar deneyin.');
      return res.sendStatus(200);
    }
    
    // Kullanıcıdan gelen cevabı ve formun mevcut durumunu Gemini'ye ilet
    let userInput = message.text?.body || '';
    let formState = getFormState(session);
    let imageFormState = getImageFormState(session);
    
    let currentFields = session.formStage === 'basic' ? formFields : imageFormFields;
    let currentAnswers = session.formStage === 'basic' ? session.answers : session.imageAnswers;
    let nextField = currentFields.find(f => !currentAnswers[f.key]);
    
    let prompt = `${SYSTEM_PROMPT}\n\nFORM AŞAMASI: ${session.formStage === 'basic' ? 'TEMEL BİLGİLER' : 'RESİM OLUŞTURMA'}\n\nŞu ana kadar alınan bilgiler:\n${session.formStage === 'basic' ? formState : imageFormState || 'Henüz bilgi yok.'}\n\nKullanıcıdan beklenen bilgi: ${nextField ? nextField.label : 'YOK'}\nKullanıcı cevabı: ${userInput}`;
    
    try {
      const geminiResponse = (await askGemini(prompt)).trim();
      console.log('Gemini asistan cevabı:', geminiResponse);
      
      // YENİ_BİLGİ formatını kontrol et
      const newInfoMatch = geminiResponse.match(/YENİ_BİLGİ:\s*([^\n]+)/i);
      if (newInfoMatch) {
        const newInfo = newInfoMatch[1];
        const currentFields = session.formStage === 'basic' ? formFields : imageFormFields;
        const currentAnswers = session.formStage === 'basic' ? session.answers : session.imageAnswers;
        
        for (const field of currentFields) {
          const regex = new RegExp(`${field.label}:\\s*([^\n]+)`, 'i');
          const match = newInfo.match(regex);
          if (match) {
            currentAnswers[field.key] = match[1].trim();
            console.log(`Yeni bilgi kaydedildi: ${field.key} = ${match[1].trim()}`);
          }
        }
      }
      
      // Eğer temel form tamamlandıysa
      if (/FORM_TAMAMLANDI/i.test(geminiResponse)) {
        try {
          await db.collection('users').add({
            phone: from,
            ...session.answers,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          // Resim formuna geç
          session.formStage = 'image';
          try {
            await sendWhatsappMessage(from, `🎉 Harika ${session.answers.name}! Temel bilgiler tamamlandı. Şimdi senin için özel bir resim oluşturmak istiyorum. Birkaç soru daha soracağım.`);
          } catch (whatsappError) {
            console.error('Geçiş mesajı gönderme hatası:', whatsappError.message);
          }
          
        } catch (err) {
          console.error('Firestore kayıt hatası:', err);
          try {
            await sendWhatsappMessage(from, 'Kaydederken bir hata oluştu. Lütfen tekrar deneyin.');
          } catch (whatsappError) {
            console.error('Hata mesajı gönderme hatası:', whatsappError.message);
          }
        }
      } else if (/IMAGE_FORM_TAMAMLANDI/i.test(geminiResponse)) {
        // Resim formu tamamlandı - AI resim oluştur
        try {
          const imagePrompt = `${session.answers.name} ve ${session.imageAnswers.bestFriendName} ${session.imageAnswers.dreamDestination} ülkesinde ${session.imageAnswers.favoriteActivity} yaparken. ${session.imageAnswers.favoriteStyle} tarzda, modern ve kaliteli bir resim.`;
          
          const images = await imagenService.generateImage(imagePrompt, {
            aspectRatio: '1:1',
            guidanceScale: 'high'
          });
          
          if (images && images.length > 0) {
            try {
              await imagenService.sendImageToWhatsApp(from, images[0].imageData, 
                `🎨 ${session.answers.name}! Senin için özel resmin hazır. ${session.imageAnswers.bestFriendName} ile ${session.imageAnswers.dreamDestination} hayalin!`);
            } catch (imageSendError) {
              console.error('Resim gönderme hatası:', imageSendError.message);
              await sendWhatsappMessage(from, 'Resim oluşturuldu ama gönderilemedi. Tekrar deneyeceğim.');
            }
          }
        } catch (imageError) {
          console.error('Resim oluşturma hatası:', imageError);
          try {
            await sendWhatsappMessage(from, 'Resim oluşturulamadı ama bilgileriniz kaydedildi. Teşekkürler!');
          } catch (whatsappError) {
            console.error('Teşekkür mesajı gönderme hatası:', whatsappError.message);
          }
        }
        delete sessions[from];
      } else {
        // Kullanıcıya Gemini'nin cevabını ilet (YENİ_BİLGİ kısmını çıkar)
        const cleanResponse = geminiResponse.replace(/YENİ_BİLGİ:.*$/gim, '').trim();
        try {
          await sendWhatsappMessage(from, cleanResponse);
        } catch (whatsappError) {
          console.error('WhatsApp mesaj gönderme hatası:', whatsappError.message);
        }
      }
    } catch (err) {
      console.error('Gemini API hatası:', err);
      try {
        await sendWhatsappMessage(from, 'Servisimiz şu anda müsait değil, lütfen biraz sonra tekrar deneyin.');
      } catch (whatsappError) {
        console.error('WhatsApp mesaj gönderme hatası:', whatsappError.message);
      }
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