const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const config = require('../config');

// Rate limiting - Spam koruması
const createRateLimiter = () => {
  return rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMaxRequests,
    message: {
      error: 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyin.',
      retryAfter: Math.ceil(config.security.rateLimitWindowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyin.',
        retryAfter: Math.ceil(config.security.rateLimitWindowMs / 1000)
      });
    }
  });
};

// WhatsApp webhook doğrulama
const verifyWebhook = (req, res, next) => {
  const signature = req.headers['x-hub-signature-256'];
  const body = JSON.stringify(req.body);
  
  if (!signature) {
    return res.status(401).json({ error: 'Webhook imzası bulunamadı' });
  }

  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', config.whatsapp.verifyToken)
    .update(body)
    .digest('hex')}`;

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Geçersiz webhook imzası' });
  }

  next();
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  if (req.body.message) {
    req.body.message = req.body.message
      .trim()
      .replace(/[<>]/g, '') // XSS koruması
      .substring(0, 1000); // Maksimum uzunluk
  }
  
  if (req.body.from) {
    req.body.from = req.body.from.replace(/[^0-9]/g, ''); // Sadece rakam
  }
  
  next();
};

// CORS ayarları
const corsOptions = {
  origin: function (origin, callback) {
    // WhatsApp API'den gelen isteklere izin ver
    if (!origin || origin.includes('facebook.com') || origin.includes('whatsapp.com')) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Güvenlik headers
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Session güvenliği
const validateSession = (req, res, next) => {
  const from = req.body.from;
  
  if (!from) {
    return res.status(400).json({ error: 'Geçersiz istek' });
  }
  
  // Session timeout kontrolü
  const session = req.app.locals.sessions?.get(from);
  if (session && Date.now() - session.lastActive > config.validation.sessionTimeout) {
    req.app.locals.sessions.delete(from);
  }
  
  next();
};

module.exports = {
  createRateLimiter,
  verifyWebhook,
  sanitizeInput,
  corsOptions,
  securityHeaders,
  validateSession
}; 