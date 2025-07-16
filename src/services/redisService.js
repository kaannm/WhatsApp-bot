const Redis = require('ioredis');
const config = require('../config');
const { logger, logError } = require('../utils/logger');

class RedisService {
  constructor() {
    this.redis = new Redis({
      host: config.redis.host || 'localhost',
      port: config.redis.port || 6379,
      password: config.redis.password,
      db: config.redis.db || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnClusterDown: 300,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      maxLoadingTimeout: 10000,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnClusterDown: 300,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      maxLoadingTimeout: 10000
    });

    // Redis event listeners
    this.redis.on('connect', () => {
      logger.info('Redis bağlantısı başarılı');
    });

    this.redis.on('error', (error) => {
      logError(error, { context: 'redis_connection' });
    });

    this.redis.on('close', () => {
      logger.warn('Redis bağlantısı kapandı');
    });

    this.redis.on('reconnecting', () => {
      logger.info('Redis yeniden bağlanıyor...');
    });
  }

  // Session kaydet
  async setSession(phoneNumber, sessionData, ttl = 600) {
    try {
      const key = `session:${phoneNumber}`;
      const data = JSON.stringify({
        ...sessionData,
        lastUpdated: Date.now()
      });

      await this.redis.setex(key, ttl, data);
      logger.info('Session kaydedildi', { phoneNumber, ttl });
      return true;
    } catch (error) {
      logError(error, { context: 'setSession', phoneNumber });
      return false;
    }
  }

  // Session getir
  async getSession(phoneNumber) {
    try {
      const key = `session:${phoneNumber}`;
      const data = await this.redis.get(key);
      
      if (data) {
        const session = JSON.parse(data);
        logger.info('Session getirildi', { phoneNumber });
        return session;
      }
      
      return null;
    } catch (error) {
      logError(error, { context: 'getSession', phoneNumber });
      return null;
    }
  }

  // Session sil
  async deleteSession(phoneNumber) {
    try {
      const key = `session:${phoneNumber}`;
      await this.redis.del(key);
      logger.info('Session silindi', { phoneNumber });
      return true;
    } catch (error) {
      logError(error, { context: 'deleteSession', phoneNumber });
      return false;
    }
  }

  // Session TTL'ini güncelle
  async updateSessionTTL(phoneNumber, ttl = 600) {
    try {
      const key = `session:${phoneNumber}`;
      await this.redis.expire(key, ttl);
      logger.info('Session TTL güncellendi', { phoneNumber, ttl });
      return true;
    } catch (error) {
      logError(error, { context: 'updateSessionTTL', phoneNumber });
      return false;
    }
  }

  // Tüm session'ları listele (debug için)
  async getAllSessions() {
    try {
      const keys = await this.redis.keys('session:*');
      const sessions = [];
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          sessions.push({
            phoneNumber: key.replace('session:', ''),
            data: JSON.parse(data)
          });
        }
      }
      
      return sessions;
    } catch (error) {
      logError(error, { context: 'getAllSessions' });
      return [];
    }
  }

  // Session sayısını getir
  async getSessionCount() {
    try {
      const keys = await this.redis.keys('session:*');
      return keys.length;
    } catch (error) {
      logError(error, { context: 'getSessionCount' });
      return 0;
    }
  }

  // Redis durumunu kontrol et
  async healthCheck() {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      logError(error, { context: 'redis_health_check' });
      return false;
    }
  }

  // Redis bağlantısını kapat
  async disconnect() {
    try {
      await this.redis.quit();
      logger.info('Redis bağlantısı kapatıldı');
    } catch (error) {
      logError(error, { context: 'redis_disconnect' });
    }
  }

  // Cache işlemleri (opsiyonel)
  async setCache(key, value, ttl = 3600) {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logError(error, { context: 'setCache', key });
      return false;
    }
  }

  async getCache(key) {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logError(error, { context: 'getCache', key });
      return null;
    }
  }

  async deleteCache(key) {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      logError(error, { context: 'deleteCache', key });
      return false;
    }
  }
}

module.exports = new RedisService(); 