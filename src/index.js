const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const config = require('./config');
const { 
  createRateLimiter, 
  verifyWebhook, 
  sanitizeInput, 
  corsOptions, 
  securityHeaders, 
  validateSession 
} = require('./middleware/security');
const { 
  logger, 
  logUserInteraction, 
  logError, 
  logSecurityEvent, 
  logValidationError, 
  logSuccessfulRegistration 
} = require('./utils/logger');
const { 
  validators, 
  sanitizeInput: sanitizeUserInput, 
  getFriendlyErrorMessage, 
  extractName, 
  formatPhoneNumber 
} = require('./utils/validators');
const { 
  getSmartMessage, 
  formatMessage, 
  getTimeBasedMessage 
} = require('./utils/messages');
const runwayService = require('./services/runwayService');
const whatsappService = require('./services/whatsappService');
const redisService = require('./services/redisService');
const queueService = require('./services/queueService');
const geminiService = require('./services/geminiService');

// Firebase başlatma
const serviceAccount = {
  type: "service_account",
  project_id: config.firebase.projectId,
  private_key_id: config.firebase.privateKeyId,
  private_key: config.firebase.privateKey,
  client_email: config.firebase.clientEmail,
  client_id: config.firebase.clientId,
  auth_uri: config.firebase.authUri,
  token_uri: config.firebase.tokenUri,
  auth_provider_x509_cert_url: config.firebase.authProviderX509CertUrl,
  client_x509_cert_url: config.firebase.clientX509CertUrl
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();

// Middleware'ler
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(createRateLimiter());
app.use(sanitizeInput);
app.use(validateSession);

// Session storage - Redis kullanılıyor
app.locals.sessions = new Map(); // Fallback için
app.locals.useRedis = process.env.NODE_ENV === 'production';

// Session yönetimi fonksiyonları
async function getSession(phoneNumber) {
  if (app.locals.useRedis) {
    return await redisService.getSession(phoneNumber);
  } else {
    return app.locals.sessions.get(phoneNumber);
  }
}

async function setSession(phoneNumber, sessionData) {
  if (app.locals.useRedis) {
    return await redisService.setSession(phoneNumber, sessionData, config.validation.sessionTimeout / 1000);
  } else {
    app.locals.sessions.set(phoneNumber, sessionData);
    return true;
  }
}

async function deleteSession(phoneNumber) {
  if (app.locals.useRedis) {
    return await redisService.deleteSession(phoneNumber);
  } else {
    return app.locals.sessions.delete(phoneNumber);
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  logError(error, { 
    url: req.url, 
    method: req.method, 
    body: req.body 
  });
  
  res.status(500).json({ 
    error: 'Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.' 
  });
});

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

// WhatsApp webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'whatsapp-bot-2024-secret-token';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("Webhook doğrulandı.");
    res.status(200).send(challenge);
  } else {
    console.log("Webhook doğrulama başarısız:", { mode, token, expectedToken: VERIFY_TOKEN });
    res.sendStatus(403);
  }
});

// Ana webhook endpoint
app.post('/webhook', (req, res) => {
  console.log('Gelen mesaj:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// 404 handler
app.all('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint bulunamadı' });
});

// AI Fotoğraf Sihirbazı işleme fonksiyonu
async function handleAIPhotoMode(req, res, from, session, incomingMessage, imageData, now) {
  try {
    // Fotoğraf kontrolü
    if (imageData) {
      
      switch (session.step) {
        case 0: // Kullanıcı fotoğrafı
          try {
            // Fotoğrafı indir
            const imageBuffer = await whatsappService.downloadImage(imageData.id);
            session.data.userImage = imageBuffer.toString('base64');
            session.step++;
            session.attempts = 0;
            
            await setSession(from, session);
            logUserInteraction(from, 'user_photo_received');
            return res.json({ reply: getSmartMessage('aiPhotoWizard.requestFriendPhoto') });
          } catch (error) {
            logError(error, { context: 'download_user_photo' });
            return res.json({ reply: getSmartMessage('aiPhotoWizard.invalidPhoto') });
          }

        case 1: // Arkadaş fotoğrafı
          try {
            // Fotoğrafı indir
            const imageBuffer = await whatsappService.downloadImage(imageData.id);
            session.data.friendImage = imageBuffer.toString('base64');
            session.step++;
            session.attempts = 0;
            
            await setSession(from, session);
            logUserInteraction(from, 'friend_photo_received');
            return res.json({ reply: getSmartMessage('aiPhotoWizard.requestPrompt') });
          } catch (error) {
            logError(error, { context: 'download_friend_photo' });
            return res.json({ reply: getSmartMessage('aiPhotoWizard.invalidPhoto') });
          }

        default:
          return res.json({ reply: 'Tüm fotoğraflar alındı. Lütfen prompt yazın.' });
      }
    }

    // Metin mesajı kontrolü
    if (incomingMessage) {
      switch (session.step) {
        case 0: // Kullanıcı fotoğrafı bekleniyor
          session.attempts++;
          await setSession(from, session);
          if (session.attempts >= config.validation.maxAttempts) {
            await deleteSession(from);
            return res.json({ reply: getSmartMessage('aiPhotoWizard.invalidPhoto') });
          }
          return res.json({ reply: getSmartMessage('aiPhotoWizard.requestUserPhoto') });

        case 1: // Arkadaş fotoğrafı bekleniyor
          session.attempts++;
          await setSession(from, session);
          if (session.attempts >= config.validation.maxAttempts) {
            await deleteSession(from);
            return res.json({ reply: getSmartMessage('aiPhotoWizard.invalidPhoto') });
          }
          return res.json({ reply: getSmartMessage('aiPhotoWizard.requestFriendPhoto') });

        case 2: // Prompt bekleniyor
          if (incomingMessage.length < 10) {
            session.attempts++;
            await setSession(from, session);
            if (session.attempts >= config.validation.maxAttempts) {
              await deleteSession(from);
              return res.json({ reply: 'Lütfen daha detaylı bir hayal anlatın.' });
            }
            return res.json({ reply: 'Lütfen daha detaylı bir hayal anlatın. En az 10 karakter olmalı.' });
          }

          session.data.prompt = incomingMessage;
          
          // İşleme mesajı gönder
          await whatsappService.sendTextMessage(from, getSmartMessage('aiPhotoWizard.processing'));
          
          try {
            // Gemini AI ile kullanıcı mesajını AI prompt'una dönüştür
            const aiPrompt = await geminiService.generateVideoPrompt(
              session.data.prompt,
              session.data.userImage,
              session.data.friendImage
            );
            
            // Video üretim işini queue'ya ekle
            await queueService.addVideoGenerationJob(
              from,
              session.data.userImage,
              session.data.friendImage,
              aiPrompt,
              session.sessionId
            );

            // Firebase'e kaydet
            await db.collection('ai_generations').add({
              phoneNumber: from,
              userImage: session.data.userImage,
              friendImage: session.data.friendImage,
              prompt: session.data.prompt,
              status: 'processing',
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              sessionId: session.sessionId
            });

            logUserInteraction(from, 'video_generation_queued', { 
              prompt: session.data.prompt,
              sessionId: session.sessionId 
            });

            // Session'ı temizle
            await deleteSession(from);

          } catch (error) {
            logError(error, { 
              phoneNumber: from, 
              prompt: session.data.prompt 
            });
            
            await whatsappService.sendTextMessage(from, getSmartMessage('aiPhotoWizard.error'));
            await deleteSession(from);
          }

          return res.json({ reply: null }); // Mesaj zaten gönderildi

        default:
          return res.json({ reply: 'Bir hata oluştu. Lütfen tekrar başlayın.' });
      }
    }

  } catch (error) {
    logError(error, { 
      phoneNumber: from, 
      mode: 'ai_photo',
      step: session.step 
    });
    
    return res.status(500).json({ 
      reply: 'Bir hata oluştu. Lütfen daha sonra tekrar deneyiniz.' 
    });
  }
}

const PORT = config.server.port;

// Uygulama başlatma
try {
  app.listen(PORT, () => {
    logger.info(`Bot sunucusu ${PORT} portunda çalışıyor`, {
      environment: config.server.nodeEnv,
      timestamp: new Date().toISOString()
    });
  });
} catch (error) {
  logger.error('Uygulama başlatma hatası:', error);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM sinyali alındı, sunucu kapatılıyor...');
  await queueService.closeQueues();
  await redisService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT sinyali alındı, sunucu kapatılıyor...');
  await queueService.closeQueues();
  await redisService.disconnect();
  process.exit(0);
}); 