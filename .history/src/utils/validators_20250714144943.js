const Joi = require('joi');

// Türkçe karakter desteği ile gelişmiş validasyonlar
const validators = {
  name: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-ZğüşöçıİĞÜŞÖÇ\s]+$/)
    .messages({
      'string.pattern.base': 'Adınızda sadece harf kullanabilirsiniz',
      'string.min': 'Adınız en az 2 karakter olmalıdır',
      'string.max': 'Adınız en fazla 50 karakter olabilir',
      'string.empty': 'Lütfen adınızı giriniz'
    }),

  phone: Joi.string()
    .pattern(/^\+90[0-9]{10}$/)
    .messages({
      'string.pattern.base': 'Telefon numaranız +90 ile başlamalı ve 13 haneli olmalıdır (örn: +905551234567)',
      'string.empty': 'Lütfen telefon numaranızı giriniz'
    }),

  email: Joi.string()
    .email({ tlds: { allow: false } })
    .messages({
      'string.email': 'Lütfen geçerli bir e-posta adresi giriniz',
      'string.empty': 'Lütfen e-posta adresinizi giriniz'
    }),

  city: Joi.string()
    .min(2)
    .max(30)
    .pattern(/^[a-zA-ZğüşöçıİĞÜŞÖÇ\s]+$/)
    .messages({
      'string.pattern.base': 'Şehir adında sadece harf kullanabilirsiniz',
      'string.min': 'Şehir adı en az 2 karakter olmalıdır',
      'string.max': 'Şehir adı en fazla 30 karakter olabilir',
      'string.empty': 'Lütfen şehir adını giriniz'
    })
};

// Akıllı input temizleme
const sanitizeInput = (input) => {
  if (!input) return '';
  
  return input
    .trim()
    .replace(/\s+/g, ' ') // Birden fazla boşluğu tek boşluğa çevir
    .replace(/[^\w\sğüşöçıİĞÜŞÖÇ@.+]/g, ''); // Sadece güvenli karakterleri tut
};

// Kullanıcı dostu hata mesajları
const getFriendlyErrorMessage = (error, fieldName) => {
  const messages = {
    name: {
      'string.pattern.base': 'Adınızda sadece harf kullanabilirsiniz. Örnek: Ahmet Yılmaz',
      'string.min': 'Adınız çok kısa görünüyor. Tam adınızı yazabilir misiniz?',
      'string.max': 'Adınız çok uzun görünüyor. Kısaltabilir misiniz?'
    },
    phone: {
      'string.pattern.base': 'Telefon numaranızı +90 ile başlayarak yazabilir misiniz? Örnek: +905551234567',
      'string.empty': 'Telefon numaranızı paylaşabilir misiniz?'
    },
    email: {
      'string.email': 'E-posta adresinizi doğru formatta yazabilir misiniz? Örnek: ornek@email.com',
      'string.empty': 'E-posta adresinizi paylaşabilir misiniz?'
    },
    city: {
      'string.pattern.base': 'Şehir adını sadece harflerle yazabilir misiniz? Örnek: İstanbul',
      'string.min': 'Şehir adı çok kısa görünüyor. Tam şehir adını yazabilir misiniz?',
      'string.max': 'Şehir adı çok uzun görünüyor. Kısaltabilir misiniz?'
    }
  };

  return messages[fieldName]?.[error.code] || 'Lütfen geçerli bir değer giriniz.';
};

// Akıllı isim tanıma
const extractName = (input) => {
  const cleaned = sanitizeInput(input);
  
  // Sadece isim yazılmışsa
  if (cleaned.split(' ').length === 1) {
    return `${cleaned} [Soyadınızı da ekleyebilirsiniz]`;
  }
  
  return cleaned;
};

// Telefon numarası formatı
const formatPhoneNumber = (input) => {
  const cleaned = input.replace(/\D/g, '');
  
  if (cleaned.startsWith('90') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return `+90${cleaned.substring(1)}`;
  }
  
  if (cleaned.length === 10) {
    return `+90${cleaned}`;
  }
  
  return input;
};

module.exports = {
  validators,
  sanitizeInput,
  getFriendlyErrorMessage,
  extractName,
  formatPhoneNumber
}; 