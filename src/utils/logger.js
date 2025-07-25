// Basit console logger (Railway için)
const logger = {
  info: (message, meta = {}) => {
    console.log(`[INFO] ${new Date().toISOString()}: ${message}`, meta);
  },
  error: (message, meta = {}) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, meta);
  },
  warn: (message, meta = {}) => {
    console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, meta);
  },
  debug: (message, meta = {}) => {
    console.log(`[DEBUG] ${new Date().toISOString()}: ${message}`, meta);
  }
};

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