const express = require('express');
const app = express();
const axios = require('axios');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const imagenService = require('./services/imagenService');
const whatsappService = require('./services/whatsappService');
const cloudinaryService = require('./services/cloudinaryService');
const geminiService = require('./services/geminiService');

// Kullanıcı oturumlarını hafızada tutmak için basit bir obje
const sessions = {};

// Form aşamaları
const FORM_STAGES = {
  WELCOME: 'welcome',
  NAME: 'name',
  FRIEND_NAME: 'friend_name',
  LAST_NAME: 'last_name',
  EMAIL: 'email',
  PHONE: 'phone',
  AGE: 'age',
  CITY: 'city',
  FUN_QUESTION_1: 'fun_question_1', // Arkadaşın ne yapmaktan hoşlanır?
  FUN_QUESTION_2: 'fun_question_2', // Sen ne yapmaktan hoşlanırsın?
  FUN_QUESTION_3: 'fun_question_3', // Birlikte nereye gitmek istersiniz?
  PHOTO_REQUEST: 'photo_request',
  PROCESSING: 'processing'
};

// Eğlenceli sorular (Coca-Cola tarzı)
const FUN_QUESTIONS = {
  FRIEND_LIKES: 'Arkadaşın ne yapmaktan hoşlanır?',
  YOU_LIKE: 'Sen ne yapmaktan hoşlanırsın?',
  DREAM_PLACE: 'Birlikte nereye gitmek istersiniz?'
};

// WhatsApp Flow Token (Meta Developer Console'dan alacaksın)
const WHATSAPP_FLOW_TOKEN = process.env.WHATSAPP_FLOW_TOKEN || 'your_flow_token_here';

// Kayıt formu seçenekleri (fallback için)
const registrationOptions = {
  cities: [
    { id: 'istanbul', title: 'İstanbul' },
    { id: 'ankara', title: 'Ankara' },
    { id: 'izmir', title: 'İzmir' },
    { id: 'bursa', title: 'Bursa' },
    { id: 'antalya', title: 'Antalya' },
    { id: 'adana', title: 'Adana' },
    { id: 'konya', title: 'Konya' },
    { id: 'gaziantep', title: 'Gaziantep' },
    { id: 'diyarbakir', title: 'Diyarbakır' },
    { id: 'other', title: 'Diğer' }
  ],
  ageGroups: [
    { id: '18-25', title: '18-25 yaş' },
    { id: '26-35', title: '26-35 yaş' },
    { id: '36-45', title: '36-45 yaş' },
    { id: '46+', title: '46+ yaş' }
  ],
  interests: [
    { id: 'sports', title: 'Spor' },
    { id: 'music', title: 'Müzik' },
    { id: 'travel', title: 'Seyahat' },
    { id: 'food', title: 'Yemek' },
    { id: 'technology', title: 'Teknoloji' },
    { id: 'art', title: 'Sanat' },
    { id: 'gaming', title: 'Oyun' },
    { id: 'fitness', title: 'Fitness' }
  ]
};

// Firebase Admin başlat
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

// Gemini AI başlat
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const gemini = new GoogleGenerativeAI(GEMINI_API_KEY);

// Kullanıcı başına 24 saatte 50 Gemini mesaj limiti
const geminiLimits = {};
const GEMINI_LIMIT = 50;
const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Sistem promptu (Coca-Cola tarzı)
const SYSTEM_PROMPT = `Sen eğlenceli ve samimi bir WhatsApp asistanısın. Coca-Cola tarzında konuş, emoji kullan, arkadaşça ol.

FORM AŞAMALARI:
1. İsim alma (chat)
2. Arkadaş adı alma (chat)
3. WhatsApp Flow (kayıt formu)
4. Eğlenceli sorular (3 soru)
5. Fotoğraf isteme (2 fotoğraf)

ÖNEMLİ KURALLAR:
1. Kullanıcıdan gelen cevapta yeni bilgi varsa, bunu "YENİ_BİLGİ: [alan]: [değer]" formatında belirt
2. Eğlenceli ve samimi konuş, emoji kullan
3. Her aşama tamamlanınca "AŞAMA_TAMAMLANDI" yaz
4. Kullanıcının adını öğrendikten sonra kullan
5. "Atla" yazarsa yeni soru sor
6. "BAŞTAN" yazarsa sıfırla
7. İsim ve arkadaş adı alındıktan sonra WhatsApp Flow'u başlat

COCA-COLA TARZI KONUŞMA:
- "Selam! Coca-Cola // Bir Arkadaşlık Hikayesi'ne hoş geldin. 🥤"
- "Tanıştığımıza memnun oldum [Ad]! 🙌"
- "Harika! [Arkadaş Adı] ile arkadaşsınız. 🎯"
- "Şimdi kayıt formunu dolduralım."
- "Harika gidiyorsun! 📸"
- "Mükemmel. Şimdi biraz bekle! 🎬"
- "Süper. Şimdi de arkadaşının ([Arkadaş Adı]) bir fotoğrafını yükle."

EĞLENCELİ SORULAR:
- "Arkadaşın ne yapmaktan hoşlanır?"
- "Sen ne yapmaktan hoşlanırsın?"
- "Birlikte nereye gitmek istersiniz?"

Kullanıcı "Atla" yazarsa, yeni bir soru sor.
Kullanıcı "BAŞTAN" yazarsa, sıfırla ve hoş geldin mesajı gönder.`;

function canUseGemini(userId) {
  const now = Date.now();
  if (!geminiLimits[userId] || now - geminiLimits[userId].start > LIMIT_WINDOW_MS) {
    geminiLimits[userId] = { count: 0, start: now };
  }
  if (geminiLimits[userId].count >= GEMINI_LIMIT) return false;
  geminiLimits[userId].count++;
  return true;
}

async function askGemini(prompt) {
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

// WhatsApp Flow gönder
async function sendWhatsAppFlow(to) {
  try {
    return await whatsappService.sendFlowMessage(to, WHATSAPP_FLOW_TOKEN, 'Kayıt formunu dolduralım! 📝\n\nFormu açmak için butona tıklayın.');
  } catch (error) {
    console.error('WhatsApp flow gönderme hatası:', error.message);
    throw error;
  }
}

// Kayıt formu gönder (fallback - List Messages)
async function sendRegistrationForm(to, formType) {
  try {
    let text;
    
    switch (formType) {
      case 'lastName':
        text = 'Soyadınız nedir? 📝';
        break;
        
      case 'email':
        text = 'E-posta adresiniz nedir? 📧';
        break;
        
      case 'phone':
        text = 'Telefon numaranız nedir? 📱';
        break;
        
      case 'age':
        text = 'Yaşınız nedir? 📊';
        break;
        
      case 'city':
        text = 'Hangi şehirde yaşıyorsun? 🏙️';
        break;
        
      default:
        throw new Error('Geçersiz form tipi');
    }
    
    return await whatsappService.sendMessage(to, text);
  } catch (error) {
    console.error('Kayıt formu gönderme hatası:', error.message);
    throw error;
  }
}

// WhatsApp mesaj gönderme
async function sendWhatsappMessage(to, text) {
  await whatsappService.sendMessage(to, text);
}

// Ana Express uygulaması
app.use(express.json());

app.get('/', (req, res) => {
  const config = require('./config');
  res.status(200).json({ 
    status: 'OK', 
    message: 'WhatsApp Bot çalışıyor!',
    whatsapp: {
      phoneNumberId: config.whatsapp.phoneNumberId ? 'Set' : 'Not Set',
      accessToken: config.whatsapp.accessToken ? 'Set' : 'Not Set',
      verifyToken: config.whatsapp.verifyToken ? 'Set' : 'Not Set'
    }
  });
});

// WhatsApp token test endpoint'i
app.get('/test-whatsapp', async (req, res) => {
  try {
    const config = require('./config');
    
    if (!config.whatsapp.accessToken) {
      return res.status(400).json({ error: 'WhatsApp access token bulunamadı' });
    }
    
    if (!config.whatsapp.phoneNumberId) {
      return res.status(400).json({ error: 'WhatsApp phone number ID bulunamadı' });
    }
    
    // WhatsApp API'yi test et
    const axios = require('axios');
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}`,
      {
        headers: { 
          Authorization: `Bearer ${config.whatsapp.accessToken}`
        },
        timeout: 10000
      }
    );
    
    res.json({ 
      status: 'success', 
      message: 'WhatsApp token geçerli',
      phoneNumberInfo: response.data
    });
    
  } catch (error) {
    console.error('WhatsApp token test hatası:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'WhatsApp token test başarısız',
      details: error.response?.data || error.message
    });
  }
});

// Imagen service test endpoint'i
app.get('/test-imagen', async (req, res) => {
  try {
    const config = require('./config');
    
    if (!config.googleCloud.projectId) {
      return res.status(400).json({ error: 'Google Cloud Project ID bulunamadı' });
    }
    
    res.json({ 
      status: 'success', 
      message: 'Imagen service hazır',
      googleCloud: {
        projectId: config.googleCloud.projectId ? 'Set' : 'Not Set'
      }
    });
    
  } catch (error) {
    console.error('Imagen service test hatası:', error.message);
    res.status(500).json({ 
      error: 'Imagen service test başarısız',
      details: error.message
    });
  }
});

// Cloudinary API test endpoint
app.get('/test-cloudinary', async (req, res) => {
  try {
    const config = require('./config');
    
    if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
      return res.json({
        status: 'error',
        message: 'Cloudinary konfigürasyonu eksik',
        details: 'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET environment variables ayarlanmamış'
      });
    }
    
    res.json({
      status: 'success',
      message: 'Cloudinary konfigürasyonu başarılı',
      cloudName: config.cloudinary.cloudName,
      apiKey: config.cloudinary.apiKey.substring(0, 10) + '...',
      apiSecret: config.cloudinary.apiSecret.substring(0, 10) + '...'
    });
    
  } catch (error) {
    console.error('Cloudinary test hatası:', error.message);
    res.json({
      status: 'error',
      message: 'Cloudinary test başarısız',
      details: error.message
    });
  }
});

// Webhook doğrulama
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

// Ana webhook endpoint
app.post('/webhook', async (req, res) => {
  console.log('POST /webhook çağrıldı');
  
  const config = require('./config');
  
  // WhatsApp token kontrolü
  if (!config.whatsapp.accessToken) {
    console.error('WhatsApp access token bulunamadı');
    return res.sendStatus(500);
  }
  
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];
  
  if (message) {
    const from = message.from;
    
    // WhatsApp Flow kullanmıyoruz, bu kısmı kaldırıyoruz
    

    
    // Template button response kullanmıyoruz, bu kısmı kaldırıyoruz
    
    // Yeni kullanıcı - hoş geldin mesajı
    if (!sessions[from]) {
      sessions[from] = { 
        stage: FORM_STAGES.WELCOME,
        answers: {},
        funAnswers: {},
        photos: []
      };
      
      try {
        await sendWhatsappMessage(from, `Selam! Coca-Cola // Bir Arkadaşlık Hikayesi'ne hoş geldin. 🥤\n\nSana ve arkadaşına özel benzersiz bir hikaye oluşturmak için buradayım. Öncesinde sadece bir kaç soru sormam gerekiyor. Herhangi bir noktada baştan başlamak istersen BAŞTAN yazman yeterli.\n\nHaydi başlayalım. Adın ne?`);
        sessions[from].stage = FORM_STAGES.NAME;
      } catch (whatsappError) {
        console.error('Hoş geldin mesajı gönderme hatası:', whatsappError.message);
      }
      return res.sendStatus(200);
    }
    
    const session = sessions[from];
    
    // Gemini limit kontrolü
    if (!canUseGemini(from)) {
      await sendWhatsappMessage(from, 'Günlük ücretsiz sohbet hakkınız doldu, yarın tekrar deneyin.');
      return res.sendStatus(200);
    }
    
    // Kullanıcı mesajını al
    const userInput = message.text?.body || '';
    
    // Medya mesajı kontrolü (fotoğraf)
    if (message.image) {
      if (session.stage === FORM_STAGES.PHOTO_REQUEST) {
        try {
          // WhatsApp medya URL'sini al
          const mediaUrl = await whatsappService.getMediaUrl(message.image.id);
          
          // Medyayı indir (token ile)
          const imageData = await whatsappService.downloadMediaAsBase64(mediaUrl);
          
          // Cloudinary'ye yükle
          const publicId = `whatsapp-bot/${session.answers.firstName || 'user'}_${Date.now()}`;
          const uploadResult = await cloudinaryService.uploadImage(imageData, publicId);
          
          // URL'yi session'a kaydet
          session.photos.push({
            url: uploadResult.url,
            publicId: uploadResult.publicId,
            assetId: uploadResult.assetId,
            timestamp: uploadResult.timestamp
          });
          
          console.log(`Fotoğraf Cloudinary'ye yüklendi: ${session.photos.length}/2`);
          
          if (session.photos.length === 1) {
            const friendName = session.answers.friendName || 'arkadaşının';
            await sendWhatsappMessage(from, `Harika! Kendi fotoğrafınız alındı ve kaydedildi. 📸\n\nŞimdi ${friendName} fotoğrafını gönderin.`);
          } else if (session.photos.length === 2) {
            await sendWhatsappMessage(from, 'Mükemmel! Her iki fotoğraf da alındı ve kaydedildi. 🎬\n\nŞimdi AI ile özel görselinizi oluşturuyorum, lütfen bekleyin...');
            session.stage = FORM_STAGES.PROCESSING;
            
            // AI işleme başlat
            await processPhotos(from, session);
          }
        } catch (error) {
          console.error('Fotoğraf işleme hatası:', error);
          
          // Hata durumunda placeholder ile devam et
          session.photos.push({
            data: 'photo_placeholder',
            timestamp: Date.now(),
            type: 'placeholder'
          });
          
          if (session.photos.length === 1) {
            const friendName = session.answers.friendName || 'arkadaşının';
            await sendWhatsappMessage(from, `Fotoğraf alındı (geçici). 📸\n\nŞimdi ${friendName} fotoğrafını gönderin.`);
          } else if (session.photos.length === 2) {
            await sendWhatsappMessage(from, 'Her iki fotoğraf da alındı (geçici). 🎬\n\nŞimdi AI ile özel görselinizi oluşturuyorum, lütfen bekleyin...');
            session.stage = FORM_STAGES.PROCESSING;
            await processPhotos(from, session);
          }
        }
      }
      return res.sendStatus(200);
    }
    
    // Metin mesajı işleme
    try {
      // BAŞTAN komutu kontrolü
      if (userInput.toLowerCase().includes('baştan')) {
        delete sessions[from];
        try {
          await sendWhatsappMessage(from, `Selam! Coca-Cola // Bir Arkadaşlık Hikayesi'ne hoş geldin. 🥤\n\nSana ve arkadaşına özel benzersiz bir hikaye oluşturmak için buradayım. Öncesinde sadece bir kaç soru sormam gerekiyor. Herhangi bir noktada baştan başlamak istersen BAŞTAN yazman yeterli.\n\nHaydi başlayalım. Adın ne?`);
        } catch (whatsappError) {
          console.error('Baştan mesajı gönderme hatası:', whatsappError.message);
        }
        return res.sendStatus(200);
            }
      
      // Manuel kayıt formu akışı
      if (session.stage === FORM_STAGES.LAST_NAME) {
        session.answers.lastName = userInput.trim();
        await sendWhatsappMessage(from, `Harika! ${userInput.trim()} soyadınız. 📝\n\nŞimdi e-posta adresinizi öğrenebilir miyim?`);
        session.stage = FORM_STAGES.EMAIL;
        return res.sendStatus(200);
      } else if (session.stage === FORM_STAGES.EMAIL) {
        session.answers.email = userInput.trim();
        await sendWhatsappMessage(from, `Teşekkürler! ${userInput.trim()} e-posta adresiniz. 📧\n\nŞimdi telefon numaranızı öğrenebilir miyim?`);
        session.stage = FORM_STAGES.PHONE;
        return res.sendStatus(200);
      } else if (session.stage === FORM_STAGES.PHONE) {
        session.answers.phone = userInput.trim();
        await sendWhatsappMessage(from, `Mükemmel! ${userInput.trim()} telefon numaranız. 📱\n\nŞimdi yaşınızı öğrenebilir miyim?`);
        session.stage = FORM_STAGES.AGE;
        return res.sendStatus(200);
      } else if (session.stage === FORM_STAGES.AGE) {
        session.answers.age = userInput.trim();
        await sendWhatsappMessage(from, `Teşekkürler! ${userInput.trim()} yaşındasınız. 📊\n\nSon olarak şehrinizi öğrenebilir miyim?`);
        session.stage = FORM_STAGES.CITY;
        return res.sendStatus(200);
      } else if (session.stage === FORM_STAGES.CITY) {
        session.answers.city = userInput.trim();
        await sendWhatsappMessage(from, `Harika! ${userInput.trim()} güzel bir şehir. 🏙️\n\nKayıt formunuz tamamlandı! Şimdi eğlenceli sorulara geçelim.\n\nİlk soru: ${FUN_QUESTIONS.FRIEND_LIKES}`);
        session.stage = FORM_STAGES.FUN_QUESTION_1;
        return res.sendStatus(200);
      }
      
            // Eğlenceli sorular aşamaları
      if (session.stage === FORM_STAGES.FUN_QUESTION_1) {
        // İlk eğlenceli soru: Arkadaşın ne yapmaktan hoşlanır?
        if (userInput.toLowerCase().includes('atla')) {
          // Soruyu atla
          await sendWhatsappMessage(from, FUN_QUESTIONS.YOU_LIKE);
          session.stage = FORM_STAGES.FUN_QUESTION_2;
        } else {
          // Cevabı kaydet
          session.funAnswers = session.funAnswers || {};
          session.funAnswers.friendLikes = userInput.trim();
          console.log(`Eğlenceli cevap kaydedildi: friendLikes = ${userInput.trim()}`);
          
          // İkinci soruya geç
          await sendWhatsappMessage(from, FUN_QUESTIONS.YOU_LIKE);
          session.stage = FORM_STAGES.FUN_QUESTION_2;
        }
        return res.sendStatus(200);
      } else if (session.stage === FORM_STAGES.FUN_QUESTION_2) {
        // İkinci eğlenceli soru: Sen ne yapmaktan hoşlanırsın?
        if (userInput.toLowerCase().includes('atla')) {
          // Soruyu atla
          await sendWhatsappMessage(from, FUN_QUESTIONS.DREAM_PLACE);
          session.stage = FORM_STAGES.FUN_QUESTION_3;
        } else {
          // Cevabı kaydet
          session.funAnswers = session.funAnswers || {};
          session.funAnswers.youLike = userInput.trim();
          console.log(`Eğlenceli cevap kaydedildi: youLike = ${userInput.trim()}`);
          
          // Üçüncü soruya geç
          await sendWhatsappMessage(from, FUN_QUESTIONS.DREAM_PLACE);
          session.stage = FORM_STAGES.FUN_QUESTION_3;
        }
        return res.sendStatus(200);
      } else if (session.stage === FORM_STAGES.FUN_QUESTION_3) {
        // Üçüncü eğlenceli soru: Birlikte nereye gitmek istersiniz?
        if (userInput.toLowerCase().includes('atla')) {
          // Soruyu atla
          await sendWhatsappMessage(from, `Harika gidiyorsun! 📸\n\nŞimdi, bana bir fotoğrafını gönderebilir misin? Yüzünün tamamen göründüğünden ve karede başka kimsenin olmadığından emin ol lütfen.`);
          session.stage = FORM_STAGES.PHOTO_REQUEST;
        } else {
          // Cevabı kaydet
          session.funAnswers = session.funAnswers || {};
          session.funAnswers.dreamPlace = userInput.trim();
          console.log(`Eğlenceli cevap kaydedildi: dreamPlace = ${userInput.trim()}`);
          
          // Fotoğraf aşamasına geç
          await sendWhatsappMessage(from, `Harika gidiyorsun! 📸\n\nŞimdi, bana bir fotoğrafını gönderebilir misin? Yüzünün tamamen göründüğünden ve karede başka kimsenin olmadığından emin ol lütfen.`);
          session.stage = FORM_STAGES.PHOTO_REQUEST;
        }
        return res.sendStatus(200);
      } else if (session.stage === FORM_STAGES.PHOTO_REQUEST) {
        // Fotoğraf aşamasında metin mesajı geldiğinde
        if (session.photos.length === 0) {
          await sendWhatsappMessage(from, 'Lütfen kendi fotoğrafınızı gönderin. 📸');
        } else if (session.photos.length === 1) {
          const friendName = session.answers.friendName || 'arkadaşınızın';
          await sendWhatsappMessage(from, `Şimdi ${friendName} fotoğrafını gönderin. 📸`);
        }
        return res.sendStatus(200);
      }
      
      // Sadece NAME ve FRIEND_NAME aşamalarında Gemini'ye git
      if (session.stage === FORM_STAGES.NAME || session.stage === FORM_STAGES.FRIEND_NAME) {
        let prompt = `${SYSTEM_PROMPT}\n\nMEVCUT AŞAMA: ${session.stage}\n\nKullanıcı cevabı: ${userInput}\n\nÖNEMLİ: Kullanıcı zaten bilgi verdiğinde, o bilgiyi kabul et ve bir sonraki aşamaya geç.`;
        
        const geminiResponse = await askGemini(prompt);
        console.log('Gemini cevabı:', geminiResponse);
        
        // YENİ_BİLGİ formatını kontrol et
        const newInfoMatch = geminiResponse.match(/YENİ_BİLGİ:\s*([^\n]+)/i);
        if (newInfoMatch) {
          const newInfo = newInfoMatch[1];
          
          if (session.stage === FORM_STAGES.NAME) {
            session.answers.name = userInput.trim();
            session.stage = FORM_STAGES.FRIEND_NAME;
            await sendWhatsappMessage(from, `Tanıştığımıza memnun oldum ${userInput.trim()}! 🙌\n\nPeki, arkadaşının adı ne?`);
          } else if (session.stage === FORM_STAGES.FRIEND_NAME) {
            session.answers.friendName = userInput.trim();
            session.stage = FORM_STAGES.LAST_NAME;
            await sendWhatsappMessage(from, `Harika! ${userInput.trim()} ile arkadaşsınız. 🎯\n\nŞimdi kayıt formunu dolduralım.\n\nSoyadınız nedir?`);
          }
        } else {
          // Gemini'nin cevabını ilet
          const cleanResponse = geminiResponse.replace(/YENİ_BİLGİ:.*$/gim, '').trim();
          await sendWhatsappMessage(from, cleanResponse);
        }
        return res.sendStatus(200);
      }
      
      // Diğer aşamalar için Gemini'ye gitme
      return res.sendStatus(200);
      
    } catch (err) {
      console.error('API hatası:', err);
      
      // WhatsApp authentication hatası kontrolü
      if (err.message.includes('WhatsApp token geçersiz')) {
        console.error('WhatsApp token sorunu tespit edildi');
        // Bu durumda kullanıcıya bilgi veremeyiz çünkü WhatsApp çalışmıyor
        return res.sendStatus(500);
      }
      
      try {
        await sendWhatsappMessage(from, 'Servisimiz şu anda müsait değil, lütfen biraz sonra tekrar deneyin.');
      } catch (whatsappError) {
        console.error('Hata mesajı gönderilemedi:', whatsappError.message);
      }
    }
  }
  
  res.sendStatus(200);
});

// Fotoğrafları işle ve sonuç gönder
async function processPhotos(from, session) {
  try {
    // Firebase'e kaydet
    await db.collection('users').add({
      phone: from,
      ...session.answers,
      funAnswers: session.funAnswers,
      photos: session.photos.map(photo => ({
        url: photo.url,
        publicId: photo.publicId,
        assetId: photo.assetId,
        timestamp: photo.timestamp
      })),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // AI resim oluştur
    const firstName = session.answers.firstName || 'Kullanıcı';
    const friendName = session.answers.friendName || 'Arkadaş';
    const dreamPlace = session.funAnswers.dreamPlace || 'güzel bir yerde';
    const friendLikes = session.funAnswers.friendLikes || 'eğlenirken';
    
    const imagePrompt = `${firstName} ve ${friendName} ${dreamPlace} ülkesinde ${friendLikes} yaparken. Modern ve kaliteli bir resim. İki arkadaş mutlu ve eğleniyor.`;
    
    try {
      const images = await imagenService.generateImage(imagePrompt, {
        aspectRatio: '1:1',
        guidanceScale: 'high'
      });
      
      if (images && images.length > 0) {
        await imagenService.sendImageToWhatsApp(from, images[0].imageData, 
          `🎨 ${firstName}! Senin için özel resmin hazır. ${friendName} ile ${dreamPlace} hayalin!`);
      } else {
        await sendWhatsappMessage(from, 'AI görsel oluşturulamadı ama bilgileriniz kaydedildi. Teşekkürler!');
      }
    } catch (imagenError) {
      console.error('Imagen service hatası:', imagenError.message);
      await sendWhatsappMessage(from, 'AI görsel oluşturulamadı ama bilgileriniz kaydedildi. Teşekkürler!');
    }
    
    // Oturumu temizle
    delete sessions[from];
    
  } catch (error) {
    console.error('Fotoğraf işleme hatası:', error);
    
    // WhatsApp authentication hatası kontrolü
    if (error.message.includes('WhatsApp token geçersiz') || error.response?.status === 401) {
      console.error('WhatsApp token sorunu tespit edildi - processPhotos');
      // Bu durumda kullanıcıya bilgi veremeyiz çünkü WhatsApp çalışmıyor
      delete sessions[from];
      return;
    }
    
    try {
      await sendWhatsappMessage(from, 'Resim oluşturulamadı ama bilgileriniz kaydedildi. Teşekkürler!');
    } catch (whatsappError) {
      console.error('Hata mesajı gönderilemedi:', whatsappError.message);
    }
    delete sessions[from];
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu http://localhost:${PORT} üzerinden çalışıyor`);
}); 