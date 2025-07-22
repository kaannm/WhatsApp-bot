require('dotenv').config();

const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
    authUri: process.env.FIREBASE_AUTH_URI,
    tokenUri: process.env.FIREBASE_TOKEN_URI,
    authProviderX509CertUrl: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    clientX509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL
  },
  
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://waba-v2.360dialog.io',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN
  },
  
  security: {
    sessionSecret: process.env.SESSION_SECRET || 'default-secret-key',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || 'logs/app.log'
  },
  
  validation: {
    maxAttempts: 3,
    sessionTimeout: 10 * 60 * 1000 // 10 dakika
  },

  runway: {
    apiKey: process.env.RUNWAY_API_KEY,
    apiUrl: process.env.RUNWAY_API_URL || 'https://api.runwayml.com/v1',
    model: 'gen-3-alpha' // Video üretim modeli
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0
  }
};

// Gerekli environment variable kontrolü kaldırıldı

module.exports = config; 