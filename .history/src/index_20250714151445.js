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

// Session storage (production'da Redis kullanılmalı)
app.locals.sessions = new Map();

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
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
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
    const from = req.body.from || 'anon';
    const incomingMessage = (req.body.message || '').trim();
    const now = Date.now();

    // Kullanıcı etkileşimini logla
    logUserInteraction(from, 'message_received', { 
      messageLength: incomingMessage.length,
      step: app.locals.sessions.get(from)?.step || 'new'
    });

    // Session kontrolü ve timeout
    if (app.locals.sessions.has(from)) {
      const session = app.locals.sessions.get(from);
      if (now - session.lastActive > config.validation.sessionTimeout) {
        app.locals.sessions.delete(from);
        logUserInteraction(from, 'session_timeout');
        return res.json({ reply: getSmartMessage('timeout') });
      } else {
        session.lastActive = now;
      }
    }

    // Özel komutlar
    if (/^(yardım|help|menu)$/i.test(incomingMessage)) {
      return res.json({ reply: getSmartMessage('help') });
    }

    if (/^(iptal|cancel|vazgeç)$/i.test(incomingMessage)) {
      app.locals.sessions.delete(from);
      logUserInteraction(from, 'cancel_registration');
      return res.json({ reply: getSmartMessage('cancel') });
    }

    // AI Fotoğraf Sihirbazı komutları
    if (/^(ai|sihirbaz|fotoğraf|photo)$/i.test(incomingMessage)) {
      app.locals.sessions.set(from, { 
        mode: 'ai_photo',
        step: 0, 
        data: {}, 
        attempts: 0, 
        lastActive: now,
        startTime: now
      });
      
      logUserInteraction(from, 'start_ai_photo_wizard');
      return res.json({ reply: getSmartMessage('aiPhotoWizard.welcome') });
    }

    // Başlangıç/reset komutları
    if (/^(merhaba|başla|restart|tekrar|selam|hi|hello)$/i.test(incomingMessage) || !app.locals.sessions.has(from)) {
      app.locals.sessions.set(from, { 
        step: 0, 
        data: {}, 
        attempts: 0, 
        lastActive: now,
        startTime: now
      });
      
      logUserInteraction(from, 'start_registration');
      return res.json({ reply: getSmartMessage('welcome') });
    }

    const session = app.locals.sessions.get(from);

    // Hata yönetimi fonksiyonu
    const handleInvalidInput = (field, error, input) => {
      session.attempts++;
      logValidationError(from, field, error, input);
      
      if (session.attempts >= config.validation.maxAttempts) {
        app.locals.sessions.delete(from);
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
          return handleInvalidInput('name', nameValidation.error, incomingMessage);
        }
        
        session.data.fullName = extractName(sanitizedName);
        session.step++;
        session.attempts = 0;
        
        logUserInteraction(from, 'name_provided', { name: session.data.fullName });
        return res.json({ 
          reply: getSmartMessage('phone_request', { userName: session.data.fullName.split(' ')[0] }) 
        });

      case 1: // Telefon
        const formattedPhone = formatPhoneNumber(incomingMessage);
        const phoneValidation = validators.phone.validate(formattedPhone);
        
        if (phoneValidation.error) {
          return handleInvalidInput('phone', phoneValidation.error, incomingMessage);
        }
        
        session.data.phone = formattedPhone;
        session.step++;
        session.attempts = 0;
        
        logUserInteraction(from, 'phone_provided', { phone: formattedPhone.replace(/\d(?=\d{4})/g, '*') });
        return res.json({ 
          reply: getSmartMessage('email_request', { userName: session.data.fullName.split(' ')[0] }) 
        });

      case 2: // Email
        const sanitizedEmail = sanitizeUserInput(incomingMessage);
        const emailValidation = validators.email.validate(sanitizedEmail);
        
        if (emailValidation.error) {
          return handleInvalidInput('email', emailValidation.error, incomingMessage);
        }
        
        session.data.email = sanitizedEmail;
        session.step++;
        session.attempts = 0;
        
        logUserInteraction(from, 'email_provided', { email: sanitizedEmail.replace(/(.{2}).*(@.*)/, '$1***$2') });
        return res.json({ 
          reply: getSmartMessage('city_request', { userName: session.data.fullName.split(' ')[0] }) 
        });

      case 3: // Şehir
        const sanitizedCity = sanitizeUserInput(incomingMessage);
        const cityValidation = validators.city.validate(sanitizedCity);
        
        if (cityValidation.error) {
          return handleInvalidInput('city', cityValidation.error, incomingMessage);
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
          app.locals.sessions.delete(from);
          
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

const PORT = config.server.port;
app.listen(PORT, () => {
  logger.info(`Bot sunucusu ${PORT} portunda çalışıyor`, {
    environment: config.server.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM sinyali alındı, sunucu kapatılıyor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT sinyali alındı, sunucu kapatılıyor...');
  process.exit(0);
}); 