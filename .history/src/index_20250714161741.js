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

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const redisHealth = await redisService.healthCheck();
    const sessionCount = await redisService.getSessionCount();
    const queueStatus = await queueService.getQueueStatus();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      redis: {
        status: redisHealth ? 'connected' : 'disconnected',
        sessionCount: sessionCount
      },
      queues: queueStatus
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// WhatsApp webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('Webhook doğrulandı');
    res.status(200).send(challenge);
  } else {
    logSecurityEvent('Webhook verification failed', { 
      mode, 
      token, 
      expectedToken: config.whatsapp.verifyToken 
    });
    res.status(403).json({ error: 'Forbidden' });
  }
});

// Ana webhook endpoint
app.post('/webhook', verifyWebhook, async (req, res) => {
  const startTime = Date.now();
  
  try {
    // 360dialog webhook formatı
    const webhookData = req.body;
    const from = webhookData.contact?.wa_id || 'anon';
    
    // Mesaj kontrolü
    let incomingMessage = '';
    let imageData = null;
    
    if (webhookData.message?.text?.body) {
      incomingMessage = webhookData.message.text.body.trim();
    } else if (webhookData.message?.image) {
      imageData = webhookData.message.image;
    }
    
    const now = Date.now();

    // Session kontrolü
    const session = await getSession(from);
    
    // Kullanıcı etkileşimini logla
    logUserInteraction(from, 'message_received', { 
      messageLength: incomingMessage.length,
      step: session?.step || 'new'
    });

    // Session timeout kontrolü
    if (session) {
      if (now - session.lastActive > config.validation.sessionTimeout) {
        await deleteSession(from);
        logUserInteraction(from, 'session_timeout');
        return res.json({ reply: getSmartMessage('timeout') });
      } else {
        session.lastActive = now;
        await setSession(from, session);
      }
    }

    // Özel komutlar
    if (/^(yardım|help|menu)$/i.test(incomingMessage)) {
      return res.json({ reply: getSmartMessage('help') });
    }

    if (/^(iptal|cancel|vazgeç)$/i.test(incomingMessage)) {
      await deleteSession(from);
      logUserInteraction(from, 'cancel_registration');
      return res.json({ reply: getSmartMessage('cancel') });
    }

    // AI Fotoğraf Sihirbazı komutları
    if (/^(ai|sihirbaz|fotoğraf|photo)$/i.test(incomingMessage)) {
      const aiSession = { 
        mode: 'ai_photo',
        step: 0, 
        data: {}, 
        attempts: 0, 
        lastActive: now,
        startTime: now
      };
      
      await setSession(from, aiSession);
      logUserInteraction(from, 'start_ai_photo_wizard');
      return res.json({ reply: getSmartMessage('aiPhotoWizard.welcome') });
    }

    // Başlangıç/reset komutları
    if (/^(merhaba|başla|restart|tekrar|selam|hi|hello)$/i.test(incomingMessage) || !session) {
      const newSession = { 
        step: 0, 
        data: {}, 
        attempts: 0, 
        lastActive: now,
        startTime: now
      };
      
      await setSession(from, newSession);
      logUserInteraction(from, 'start_registration');
      return res.json({ reply: getSmartMessage('welcome') });
    }

    // AI Fotoğraf Sihirbazı modu kontrolü
    if (session.mode === 'ai_photo') {
      return handleAIPhotoMode(req, res, from, session, incomingMessage, imageData, now);
    }

    // Hata yönetimi fonksiyonu
    const handleInvalidInput = async (field, error, input) => {
      session.attempts++;
      await setSession(from, session);
      logValidationError(from, field, error, input);
      
      if (session.attempts >= config.validation.maxAttempts) {
        await deleteSession(from);
        logSecurityEvent('max_attempts_exceeded', { phoneNumber: from });
        return res.json({ reply: getSmartMessage('error', { attempts: session.attempts, maxAttempts: config.validation.maxAttempts }) });
      }
      
      return res.json({ 
        reply: getFriendlyErrorMessage(error, field) 
      });
    };

    // Adım bazlı işleme
    switch (session.step) {
      case 0: // İsim
        const sanitizedName = sanitizeUserInput(incomingMessage);
        const nameValidation = validators.name.validate(sanitizedName);
        
        if (nameValidation.error) {
          return await handleInvalidInput('name', nameValidation.error, incomingMessage);
        }
        
        session.data.fullName = extractName(sanitizedName);
        session.step++;
        session.attempts = 0;
        
        await setSession(from, session);
        logUserInteraction(from, 'name_provided', { name: session.data.fullName });
        return res.json({ 
          reply: getSmartMessage('phone_request', { userName: session.data.fullName.split(' ')[0] }) 
        });

      case 1: // Telefon
        const formattedPhone = formatPhoneNumber(incomingMessage);
        const phoneValidation = validators.phone.validate(formattedPhone);
        
        if (phoneValidation.error) {
          return await handleInvalidInput('phone', phoneValidation.error, incomingMessage);
        }
        
        session.data.phone = formattedPhone;
        session.step++;
        session.attempts = 0;
        
        await setSession(from, session);
        logUserInteraction(from, 'phone_provided', { phone: formattedPhone.replace(/\d(?=\d{4})/g, '*') });
        return res.json({ 
          reply: getSmartMessage('email_request', { userName: session.data.fullName.split(' ')[0] }) 
        });

      case 2: // Email
        const sanitizedEmail = sanitizeUserInput(incomingMessage);
        const emailValidation = validators.email.validate(sanitizedEmail);
        
        if (emailValidation.error) {
          return await handleInvalidInput('email', emailValidation.error, incomingMessage);
        }
        
        session.data.email = sanitizedEmail;
        session.step++;
        session.attempts = 0;
        
        await setSession(from, session);
        logUserInteraction(from, 'email_provided', { email: sanitizedEmail.replace(/(.{2}).*(@.*)/, '$1***$2') });
        return res.json({ 
          reply: getSmartMessage('city_request', { userName: session.data.fullName.split(' ')[0] }) 
        });

      case 3: // Şehir
        const sanitizedCity = sanitizeUserInput(incomingMessage);
        const cityValidation = validators.city.validate(sanitizedCity);
        
        if (cityValidation.error) {
          return await handleInvalidInput('city', cityValidation.error, incomingMessage);
        }
        
        session.data.city = sanitizedCity;

        try {
          // Firebase'e kaydet
          await db.collection('users').add({
            ...session.data,
            phoneNumber: from, // WhatsApp numarası
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            registrationDuration: now - session.startTime
          });

          logSuccessfulRegistration(from, session.data);
          await deleteSession(from);
          
          const successMessage = getSmartMessage('success', { userData: session.data });
          return res.json({ reply: successMessage });
          
        } catch (error) {
          logError(error, { 
            phoneNumber: from, 
            userData: session.data 
          });
          
          return res.status(500).json({ 
            reply: 'Kaydetme sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyiniz.' 
          });
        }

      default:
        return res.json({ 
          reply: 'Tüm bilgileri aldım. Yeni kayıt için "Merhaba" yazabilirsiniz.' 
        });
    }

  } catch (error) {
    logError(error, { 
      body: req.body, 
      url: req.url 
    });
    
    res.status(500).json({ 
      reply: 'Bir hata oluştu. Lütfen daha sonra tekrar deneyiniz.' 
    });
  } finally {
    // Performance logging
    const duration = Date.now() - startTime;
    if (duration > 1000) { // 1 saniyeden uzun süren işlemleri logla
      logger.warn('Yavaş webhook işlemi', { duration, phoneNumber: req.body.from });
    }
  }
});

// 404 handler
app.use('*', (req, res) => {
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
            // AI görsel oluştur
            const result = await runwayService.processImages(
              session.data.userImage,
              session.data.friendImage,
              session.data.prompt
            );

            // Görseli WhatsApp'ta gönder
            await whatsappService.sendImageMessage(
              from,
              result.imageBuffer,
              getSmartMessage('aiPhotoWizard.success', { prompt: session.data.prompt })
            );

            // Firebase'e kaydet
            await db.collection('ai_generations').add({
              phoneNumber: from,
              userImage: session.data.userImage,
              friendImage: session.data.friendImage,
              prompt: session.data.prompt,
              generationId: result.generationId,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              processingTime: Date.now() - session.startTime
            });

            logUserInteraction(from, 'ai_generation_success', { 
              prompt: session.data.prompt,
              generationId: result.generationId 
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
app.listen(PORT, () => {
  logger.info(`Bot sunucusu ${PORT} portunda çalışıyor`, {
    environment: config.server.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM sinyali alındı, sunucu kapatılıyor...');
  await redisService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT sinyali alındı, sunucu kapatılıyor...');
  await redisService.disconnect();
  process.exit(0);
}); 