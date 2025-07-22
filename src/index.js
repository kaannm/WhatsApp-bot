const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Railway Express çalışıyor!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu http://localhost:${PORT} üzerinden çalışıyor`);
}); 