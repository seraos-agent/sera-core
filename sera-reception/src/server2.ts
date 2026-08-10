import express from 'express';

const app = express();
const port = 3002;

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Test server listening on port ${port}`);
});
