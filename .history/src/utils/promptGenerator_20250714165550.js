const promptGenerator = {
  // Ana prompt dönüştürme fonksiyonu
  generatePrompt: (userMessage) => {
    const basePrompt = "Two friends in a cinematic scene, high quality, smooth camera movement, 30 seconds duration";
    
    // Kullanıcı mesajını analiz et
    const analysis = analyzeUserMessage(userMessage);
    
    // Prompt oluştur
    const scenePrompt = generateScenePrompt(analysis);
    
    return `${scenePrompt}, ${basePrompt}`;
  },

  // Kullanıcı mesajını analiz et
  analyzeUserMessage: (message) => {
    const lowerMessage = message.toLowerCase();
    
    // Temaları tespit et
    const themes = {
      vacation: ['tatil', 'sahil', 'deniz', 'güneş', 'plaj', 'yaz', 'tropik'],
      adventure: ['macera', 'dağ', 'tırmanış', 'doğa', 'orman', 'keşif'],
      city: ['şehir', 'istanbul', 'boğaz', 'cadde', 'bina', 'kent'],
      romantic: ['romantik', 'aşk', 'çift', 'romantik', 'sevgi'],
      action: ['aksiyon', 'savaş', 'koşu', 'spor', 'enerjik'],
      fantasy: ['fantastik', 'uzay', 'sihir', 'büyü', 'hayal'],
      business: ['iş', 'ofis', 'toplantı', 'profesyonel', 'çalışma']
    };

    // Hangi temaya ait olduğunu bul
    let detectedTheme = 'general';
    for (const [theme, keywords] of Object.entries(themes)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        detectedTheme = theme;
        break;
      }
    }

    // Zaman ve atmosfer tespit et
    const timeOfDay = detectTimeOfDay(lowerMessage);
    const atmosphere = detectAtmosphere(lowerMessage);
    const activity = detectActivity(lowerMessage);

    return {
      theme: detectedTheme,
      timeOfDay,
      atmosphere,
      activity,
      originalMessage: message
    };
  },

  // Sahne prompt'u oluştur
  generateScenePrompt: (analysis) => {
    const { theme, timeOfDay, atmosphere, activity } = analysis;
    
    let scenePrompt = "Two friends";

    // Aktivite ekle
    if (activity) {
      scenePrompt += ` ${activity}`;
    }

    // Tema bazlı detaylar
    switch (theme) {
      case 'vacation':
        scenePrompt += ", on a beautiful beach, tropical setting, palm trees, crystal clear water";
        break;
      case 'adventure':
        scenePrompt += ", in a mountain landscape, rocky terrain, epic scenery, adventurous atmosphere";
        break;
      case 'city':
        scenePrompt += ", in an urban cityscape, modern buildings, city life, urban exploration";
        break;
      case 'romantic':
        scenePrompt += ", in a romantic setting, intimate atmosphere, soft lighting, emotional connection";
        break;
      case 'action':
        scenePrompt += ", in an action scene, dynamic movement, energetic atmosphere, exciting environment";
        break;
      case 'fantasy':
        scenePrompt += ", in a magical fantasy world, mystical atmosphere, otherworldly setting";
        break;
      case 'business':
        scenePrompt += ", in a professional business setting, modern office, corporate environment";
        break;
      default:
        scenePrompt += ", in a beautiful natural setting";
    }

    // Zaman ekle
    if (timeOfDay) {
      scenePrompt += `, ${timeOfDay}`;
    }

    // Atmosfer ekle
    if (atmosphere) {
      scenePrompt += `, ${atmosphere}`;
    }

    return scenePrompt;
  },

  // Zaman tespit et
  detectTimeOfDay: (message) => {
    if (message.includes('güneş batımı') || message.includes('akşam')) {
      return 'during sunset, golden hour lighting';
    }
    if (message.includes('güneş doğumu') || message.includes('sabah')) {
      return 'during sunrise, early morning light';
    }
    if (message.includes('gece') || message.includes('yıldız')) {
      return 'at night, starry sky, moonlight';
    }
    if (message.includes('gün') || message.includes('öğle')) {
      return 'during daytime, bright sunlight';
    }
    return null;
  },

  // Atmosfer tespit et
  detectAtmosphere: (message) => {
    if (message.includes('romantik') || message.includes('aşk')) {
      return 'romantic atmosphere, intimate mood';
    }
    if (message.includes('macera') || message.includes('heyecan')) {
      return 'adventurous atmosphere, exciting mood';
    }
    if (message.includes('huzur') || message.includes('sakin')) {
      return 'peaceful atmosphere, calm mood';
    }
    if (message.includes('enerji') || message.includes('dinamik')) {
      return 'energetic atmosphere, dynamic mood';
    }
    return null;
  },

  // Aktivite tespit et
  detectActivity: (message) => {
    const activities = {
      'yürüyoruz': 'walking',
      'koşuyoruz': 'running',
      'dans ediyoruz': 'dancing',
      'oturuyoruz': 'sitting',
      'gülüyoruz': 'laughing',
      'konuşuyoruz': 'talking',
      'oynuyoruz': 'playing',
      'spor yapıyoruz': 'exercising',
      'yemek yiyoruz': 'eating',
      'içiyoruz': 'drinking'
    };

    for (const [turkish, english] of Object.entries(activities)) {
      if (message.includes(turkish)) {
        return english;
      }
    }

    return null;
  },

  // Örnek prompt'lar
  getExamplePrompts: () => {
    return [
      {
        user: "Tatilde sahilde güneş batımında yürüyoruz",
        ai: "Two friends walking on a beautiful beach during sunset, golden hour lighting, tropical setting, palm trees, crystal clear water, romantic atmosphere, calm mood, cinematic quality, smooth camera movement, 30 seconds duration"
      },
      {
        user: "Dağda tırmanış yapıyoruz",
        ai: "Two friends climbing in a mountain landscape, rocky terrain, epic scenery, adventurous atmosphere, exciting mood, during daytime, bright sunlight, dynamic movement, cinematic quality, smooth camera movement, 30 seconds duration"
      },
      {
        user: "İstanbul'da Boğaz'da yürüyoruz",
        ai: "Two friends walking in an urban cityscape, modern buildings, city life, urban exploration, along the Bosphorus in Istanbul, during daytime, bright sunlight, peaceful atmosphere, calm mood, cinematic quality, smooth camera movement, 30 seconds duration"
      }
    ];
  }
};

module.exports = promptGenerator; 