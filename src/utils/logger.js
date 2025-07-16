const winston = require('winston');
const path = require('path');
const config = require('../config');

// Log dosyası için klasör oluştur
const fs = require('fs');
const logDir = path.dirname(config.logging.filePath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Özel log formatı
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// Winston logger konfigürasyonu
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    // Dosyaya yazma
    new winston.transports.File({
      filename: config.logging.filePath,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Hata logları için ayrı dosya
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

// Development ortamında console'a da yaz
if (config.server.nodeEnv === 'development') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Özel log fonksiyonları
const logUserInteraction = (phoneNumber, action, details = {}) => {
  logger.info('Kullanıcı Etkileşimi', {
    phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'), // Telefon numarasını maskele
    action,
    timestamp: new Date().toISOString(),
    ...details
  });
};

const logError = (error, context = {}) => {
  logger.error('Sistem Hatası', {
    error: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
};

const logSecurityEvent = (event, details = {}) => {
  logger.warn('Güvenlik Olayı', {
    event,
    details,
    timestamp: new Date().toISOString()
  });
};

const logValidationError = (phoneNumber, field, error, input) => {
  logger.info('Validasyon Hatası', {
    phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
    field,
    error: error.message,
    input: input.substring(0, 50), // Input'u kısalt
    timestamp: new Date().toISOString()
  });
};

const logSuccessfulRegistration = (phoneNumber, userData) => {
  logger.info('Başarılı Kayıt', {
    phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
    userName: userData.fullName,
    city: userData.city,
    timestamp: new Date().toISOString()
  });
};

// Performance logging
const logPerformance = (operation, duration, details = {}) => {
  logger.info('Performans Metriği', {
    operation,
    duration: `${duration}ms`,
    details,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  logger,
  logUserInteraction,
  logError,
  logSecurityEvent,
  logValidationError,
  logSuccessfulRegistration,
  logPerformance
}; 