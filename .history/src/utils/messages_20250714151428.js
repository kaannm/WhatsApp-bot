// Kişiselleştirilmiş mesaj şablonları
const messageTemplates = {
  welcome: (userName = '') => {
    const greetings = [
      'Merhaba! 👋',
      'Hoş geldiniz! 😊',
      'Selam! 🎉',
      'Merhaba, nasılsınız? 😄'
    ];
    
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    if (userName) {
      return `${randomGreeting} ${userName}! Bilgilerinizi almak için size yardımcı olacağım. Öncelikle adınızı ve soyadınızı paylaşır mısınız?`;
    }
    
    return `${randomGreeting} Bilgilerinizi almak için size yardımcı olacağım. Öncelikle adınızı ve soyadınızı paylaşır mısınız?`;
  },

  nameRequest: () => {
    const messages = [
      'Adınızı ve soyadınızı paylaşır mısınız? 📝',
      'İsminizi öğrenebilir miyim? 😊',
      'Adınızı ve soyadınızı yazabilir misiniz? ✍️',
      'Öncelikle adınızı alabilir miyim? 📋'
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  },

  phoneRequest: (userName) => {
    const messages = [
      `Teşekkürler ${userName}! 📱 Şimdi telefon numaranızı alabilir miyim? (+90 ile başlayarak)`,
      `${userName}, telefon numaranızı paylaşır mısınız? 📞 (+90 ile başlayarak)`,
      `Harika ${userName}! 📲 Telefon numaranızı yazabilir misiniz? (+90 ile başlayarak)`,
      `${userName}, iletişim için telefon numaranızı alabilir miyim? 📱 (+90 ile başlayarak)`
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  },

  emailRequest: (userName) => {
    const messages = [
      `${userName}, e-posta adresinizi paylaşabilir misiniz? 📧`,
      `Teşekkürler! 📨 ${userName}, e-posta adresinizi alabilir miyim?`,
      `${userName}, e-posta adresinizi yazabilir misiniz? 📬`,
      `Harika! 📧 ${userName}, e-posta adresinizi paylaşır mısınız?`
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  },

  cityRequest: (userName) => {
    const messages = [
      `${userName}, hangi şehirde yaşıyorsunuz? 🏙️`,
      `Son olarak ${userName}, hangi şehirde yaşıyorsunuz? 🏘️`,
      `${userName}, şehir bilginizi alabilir miyim? 🌆`,
      `Nerede yaşıyorsunuz ${userName}? 🏠`
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  },

  success: (userData) => {
    const messages = [
      `🎉 Teşekkürler ${userData.fullName}! Bilgileriniz başarıyla kaydedildi.`,
      `✅ Harika ${userData.fullName}! Kaydınız tamamlandı.`,
      `🎊 ${userData.fullName}, teşekkürler! Bilgileriniz güvenle saklandı.`,
      `✨ Mükemmel ${userData.fullName}! İşleminiz başarıyla tamamlandı.`
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  },

  error: (attempts, maxAttempts) => {
    const remaining = maxAttempts - attempts;
    
    if (remaining === 1) {
      return '⚠️ Son bir deneme hakkınız kaldı. Lütfen dikkatli olun.';
    }
    
    if (remaining === 0) {
      return '❌ Çok fazla yanlış giriş yaptınız. Lütfen "Merhaba" yazarak tekrar başlayın.';
    }
    
    return `⚠️ Yanlış giriş. ${remaining} deneme hakkınız kaldı.`;
  },

  help: () => {
    return `🤖 Size nasıl yardımcı olabilirim?

• "Merhaba" - Yeni kayıt başlat
• "Yardım" - Bu mesajı göster
• "İptal" - Mevcut işlemi iptal et

Herhangi bir sorunuz varsa yardımcı olmaktan mutluluk duyarım! 😊`;
  },

  cancel: () => {
    return '🔄 İşlem iptal edildi. Yeni kayıt için "Merhaba" yazabilirsiniz.';
  },

  timeout: () => {
    return '⏰ Uzun süredir yanıt vermediğiniz için oturumunuz sonlandı. Yeni kayıt için "Merhaba" yazabilirsiniz.';
  },

  // AI Fotoğraf Sihirbazı mesajları
  aiPhotoWizard: {
    welcome: () => {
      const messages = [
        '🎨 AI Fotoğraf Sihirbazına hoş geldiniz! Sizin ve arkadaşınızın fotoğraflarını kullanarak harika görseller oluşturalım!',
        '✨ Fotoğraf Sihirbazı başlatılıyor! İki fotoğraf ve bir hayal ile muhteşem görseller yaratacağız!',
        '🌟 AI Sihirbazı hazır! Fotoğraflarınızı paylaşın, hayallerinizi gerçeğe dönüştürelim!'
      ];
      return messages[Math.floor(Math.random() * messages.length)];
    },

    requestUserPhoto: () => {
      const messages = [
        '📸 Önce kendi fotoğrafınızı gönderin! (Selfie veya portre fotoğrafı)',
        '📱 Kendi fotoğrafınızı paylaşır mısınız? En iyi sonuç için net bir portre olmalı.',
        '🖼️ İlk olarak sizin fotoğrafınızı alalım! Güzel bir selfie gönderin.'
      ];
      return messages[Math.floor(Math.random() * messages.length)];
    },

    requestFriendPhoto: () => {
      const messages = [
        '👥 Şimdi arkadaşınızın fotoğrafını gönderin!',
        '📸 Arkadaşınızın fotoğrafını paylaşır mısınız?',
        '🖼️ İkinci fotoğraf: Arkadaşınızın portresini gönderin!'
      ];
      return messages[Math.floor(Math.random() * messages.length)];
    },

    requestPrompt: () => {
      const messages = [
        '💭 Şimdi hayalinizi anlatın! Örneğin:\n• "En yakın arkadaşımla Japonya\'da geziyoruz"\n• "Birlikte uzayda yürüyoruz"\n• "Antik Roma\'da gladyatör olmuşuz"\n\nHayalinizi yazın:',
        '🎭 Hayal gücünüzü kullanın! Nerede olmak istiyorsunuz?\n\nÖrnekler:\n• "Paris\'te Eiffel Kulesi\'nde"\n• "Venedik\'te gondolda"\n• "Hawaii\'de plajda"\n\nHayalinizi paylaşın:',
        '🌈 Şimdi en güzel kısmı! Hayalinizi anlatın:\n\n💡 Örnekler:\n• "Birlikte balonla dünya turu"\n• "Orta Çağ\'da şövalye olmuşuz"\n• "Deniz altında yaşıyoruz"\n\nHayalinizi yazın:'
      ];
      return messages[Math.floor(Math.random() * messages.length)];
    },

    processing: () => {
      const messages = [
        '🎨 AI görselinizi oluşturuyorum... Bu biraz zaman alabilir! ⏳',
        '✨ Sihirli değnek çalışıyor! Görseliniz hazırlanıyor... 🪄',
        '🌟 AI hayalinizi gerçeğe dönüştürüyor... Lütfen bekleyin! ✨'
      ];
      return messages[Math.floor(Math.random() * messages.length)];
    },

    success: (prompt) => {
      const messages = [
        `🎉 İşte hayaliniz! "${prompt}"\n\nGörseliniz hazır! 🎨✨`,
        `✨ Muhteşem! "${prompt}" hayaliniz gerçeğe dönüştü! 🎭`,
        `🌟 Harika! "${prompt}" görseliniz tamamlandı! 🎨`
      ];
      return messages[Math.floor(Math.random() * messages.length)];
    },

    error: () => {
      const messages = [
        '❌ Üzgünüm, görsel oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.',
        '😔 Görsel oluşturulamadı. Farklı fotoğraflarla tekrar deneyebilir misiniz?',
        '⚠️ Bir sorun oluştu. Lütfen daha sonra tekrar deneyin.'
      ];
      return messages[Math.floor(Math.random() * messages.length)];
    },

    invalidPhoto: () => {
      return '📸 Lütfen geçerli bir fotoğraf gönderin. Selfie veya portre fotoğrafı olmalı.';
    },

    help: () => {
      return `🎨 AI Fotoğraf Sihirbazı Yardım

Bu özellik ile:
• Kendi fotoğrafınızı gönderin
• Arkadaşınızın fotoğrafını gönderin  
• Hayalinizi anlatın
• AI size özel görsel oluştursun!

Komutlar:
• "AI" - Sihirbazı başlat
• "Yardım" - Bu mesajı göster
• "İptal" - İşlemi iptal et

Başlamak için "AI" yazın! ✨`;
    }
  }
};

// Akıllı mesaj seçimi
const getSmartMessage = (type, context = {}) => {
  const { userName, attempts, maxAttempts, userData } = context;
  
  switch (type) {
    case 'welcome':
      return messageTemplates.welcome(userName);
    case 'name_request':
      return messageTemplates.nameRequest();
    case 'phone_request':
      return messageTemplates.phoneRequest(userName);
    case 'email_request':
      return messageTemplates.emailRequest(userName);
    case 'city_request':
      return messageTemplates.cityRequest(userName);
    case 'success':
      return messageTemplates.success(userData);
    case 'error':
      return messageTemplates.error(attempts, maxAttempts);
    case 'help':
      return messageTemplates.help();
    case 'cancel':
      return messageTemplates.cancel();
    case 'timeout':
      return messageTemplates.timeout();
    default:
      return 'Bir hata oluştu. Lütfen tekrar deneyin.';
  }
};

// Emoji ve formatlamalı mesajlar
const formatMessage = (message, options = {}) => {
  let formatted = message;
  
  // Önemli kelimeleri vurgula
  if (options.highlight) {
    options.highlight.forEach(word => {
      const regex = new RegExp(`(${word})`, 'gi');
      formatted = formatted.replace(regex, '*$1*');
    });
  }
  
  // Satır sonları ekle
  if (options.addLineBreaks) {
    formatted = formatted.replace(/\. /g, '.\n');
  }
  
  return formatted;
};

// Zaman bazlı mesajlar
const getTimeBasedMessage = () => {
  const hour = new Date().getHours();
  
  if (hour < 12) {
    return 'Günaydın! ☀️';
  } else if (hour < 18) {
    return 'İyi günler! 🌤️';
  } else {
    return 'İyi akşamlar! 🌙';
  }
};

module.exports = {
  messageTemplates,
  getSmartMessage,
  formatMessage,
  getTimeBasedMessage
}; 