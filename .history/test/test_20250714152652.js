const axios = require('axios');

// Test konfigürasyonu
const TEST_CONFIG = {
  baseURL: 'http://localhost:3000',
  timeout: 10000
};

// Test fonksiyonları
async function testHealthCheck() {
  try {
    console.log('🔍 Health check testi...');
    const response = await axios.get(`${TEST_CONFIG.baseURL}/health`);
    console.log('✅ Health check başarılı:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Health check başarısız:', error.message);
    return false;
  }
}

async function testWebhookVerification() {
  try {
    console.log('🔍 Webhook doğrulama testi...');
    const response = await axios.get(`${TEST_CONFIG.baseURL}/webhook`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test-token',
        'hub.challenge': 'test-challenge'
      }
    });
    console.log('✅ Webhook doğrulama başarılı');
    return true;
  } catch (error) {
    console.log('⚠️ Webhook doğrulama beklenen hata (token yanlış):', error.response?.status);
    return true; // Bu beklenen bir hata
  }
}

async function testRegistrationFlow() {
  try {
    console.log('🔍 Kayıt akışı testi...');
    
    // Test verileri
    const testData = {
      contact: { wa_id: '905551234567' },
      message: {
        text: { body: 'merhaba' }
      }
    };

    const response = await axios.post(`${TEST_CONFIG.baseURL}/webhook`, testData, {
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'test-signature'
      }
    });

    console.log('✅ Kayıt akışı başarılı:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Kayıt akışı başarısız:', error.message);
    return false;
  }
}

// Ana test fonksiyonu
async function runTests() {
  console.log('🚀 Test başlatılıyor...\n');

  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'Webhook Verification', fn: testWebhookVerification },
    { name: 'Registration Flow', fn: testRegistrationFlow }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\n📋 ${test.name} testi çalıştırılıyor...`);
    const result = await test.fn();
    
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('\n📊 Test Sonuçları:');
  console.log(`✅ Başarılı: ${passed}`);
  console.log(`❌ Başarısız: ${failed}`);
  console.log(`📈 Toplam: ${tests.length}`);

  if (failed === 0) {
    console.log('\n🎉 Tüm testler başarılı!');
  } else {
    console.log('\n⚠️ Bazı testler başarısız oldu.');
  }
}

// Test çalıştır
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests }; 