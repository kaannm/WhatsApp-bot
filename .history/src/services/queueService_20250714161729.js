const Queue = require('bull');
const config = require('../config');
const logger = require('../utils/logger');
const runwayService = require('./runwayService');
const whatsappService = require('./whatsappService');

// Queue tanımlamaları
const videoGenerationQueue = new Queue('video-generation', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db
  }
});

const messageQueue = new Queue('whatsapp-messages', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db
  }
});

// Video üretim queue processor
videoGenerationQueue.process(async (job) => {
  try {
    const { phoneNumber, image1, image2, prompt, sessionId } = job.data;
    
    logger.info(`Video üretimi başladı: ${phoneNumber}`, { sessionId });
    
    // Video üretimi
    const videoResult = await runwayService.generateVideo(image1, image2, prompt);
    
    // Sonucu WhatsApp'a gönder
    await messageQueue.add('send-video', {
      phoneNumber,
      videoUrl: videoResult.videoUrl,
      message: 'Video hazır! İşte sizin özel videonuz:',
      sessionId
    });
    
    logger.info(`Video üretimi tamamlandı: ${phoneNumber}`, { sessionId });
    
    return { success: true, videoUrl: videoResult.videoUrl };
    
  } catch (error) {
    logger.error(`Video üretim hatası: ${error.message}`, { 
      phoneNumber: job.data.phoneNumber,
      sessionId: job.data.sessionId 
    });
    
    // Hata mesajı gönder
    await messageQueue.add('send-error', {
      phoneNumber: job.data.phoneNumber,
      message: 'Video üretiminde bir hata oluştu. Lütfen tekrar deneyin.',
      sessionId: job.data.sessionId
    });
    
    throw error;
  }
});

// WhatsApp mesaj queue processor
messageQueue.process('send-video', async (job) => {
  try {
    const { phoneNumber, videoUrl, message, sessionId } = job.data;
    
    await whatsappService.sendVideo(phoneNumber, videoUrl, message);
    
    logger.info(`Video gönderildi: ${phoneNumber}`, { sessionId });
    
  } catch (error) {
    logger.error(`Video gönderme hatası: ${error.message}`, { 
      phoneNumber: job.data.phoneNumber,
      sessionId: job.data.sessionId 
    });
    throw error;
  }
});

messageQueue.process('send-error', async (job) => {
  try {
    const { phoneNumber, message, sessionId } = job.data;
    
    await whatsappService.sendMessage(phoneNumber, message);
    
    logger.info(`Hata mesajı gönderildi: ${phoneNumber}`, { sessionId });
    
  } catch (error) {
    logger.error(`Hata mesajı gönderme hatası: ${error.message}`, { 
      phoneNumber: job.data.phoneNumber,
      sessionId: job.data.sessionId 
    });
    throw error;
  }
});

// Queue event listeners
videoGenerationQueue.on('completed', (job, result) => {
  logger.info(`Video üretim işi tamamlandı: ${job.id}`, { 
    phoneNumber: job.data.phoneNumber,
    sessionId: job.data.sessionId 
  });
});

videoGenerationQueue.on('failed', (job, err) => {
  logger.error(`Video üretim işi başarısız: ${job.id}`, { 
    error: err.message,
    phoneNumber: job.data.phoneNumber,
    sessionId: job.data.sessionId 
  });
});

messageQueue.on('completed', (job, result) => {
  logger.info(`Mesaj gönderme işi tamamlandı: ${job.id}`, { 
    phoneNumber: job.data.phoneNumber,
    sessionId: job.data.sessionId 
  });
});

messageQueue.on('failed', (job, err) => {
  logger.error(`Mesaj gönderme işi başarısız: ${job.id}`, { 
    error: err.message,
    phoneNumber: job.data.phoneNumber,
    sessionId: job.data.sessionId 
  });
});

// Queue yönetim fonksiyonları
const queueService = {
  // Video üretim işi ekle
  addVideoGenerationJob: async (phoneNumber, image1, image2, prompt, sessionId) => {
    const job = await videoGenerationQueue.add({
      phoneNumber,
      image1,
      image2,
      prompt,
      sessionId
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: 100,
      removeOnFail: 50
    });
    
    logger.info(`Video üretim işi eklendi: ${job.id}`, { phoneNumber, sessionId });
    return job;
  },
  
  // Mesaj gönderme işi ekle
  addMessageJob: async (type, data) => {
    const job = await messageQueue.add(type, data, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: 200,
      removeOnFail: 100
    });
    
    logger.info(`Mesaj işi eklendi: ${job.id}`, { 
      type, 
      phoneNumber: data.phoneNumber,
      sessionId: data.sessionId 
    });
    return job;
  },
  
  // Queue durumlarını al
  getQueueStatus: async () => {
    const videoStats = await videoGenerationQueue.getJobCounts();
    const messageStats = await messageQueue.getJobCounts();
    
    return {
      videoGeneration: videoStats,
      messages: messageStats
    };
  },
  
  // Queue'ları temizle
  cleanQueues: async () => {
    await videoGenerationQueue.clean(0, 'completed');
    await videoGenerationQueue.clean(0, 'failed');
    await messageQueue.clean(0, 'completed');
    await messageQueue.clean(0, 'failed');
    
    logger.info('Queue\'lar temizlendi');
  },
  
  // Queue'ları durdur
  closeQueues: async () => {
    await videoGenerationQueue.close();
    await messageQueue.close();
    logger.info('Queue\'lar kapatıldı');
  }
};

module.exports = queueService; 