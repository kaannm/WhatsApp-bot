const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://<YOUR_PROJECT_ID>.firebaseio.com"
});

const db = admin.firestore();

const app = express();
app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  const incomingMessage = req.body.message || "Mesaj yok";
  console.log("Gelen mesaj:", incomingMessage);

  try {
    await db.collection('messages').add({
      text: incomingMessage,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("Mesaj Firestore'a kaydedildi.");
  } catch (error) {
    console.error("Firestore kaydetme hatası:", error);
  }

  const reply = "Merhaba! Bu bir simülasyondur. Mesajın: " + incomingMessage;

  res.json({ reply });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Bot sunucusu ${PORT} portunda çalışıyor.`);
});
