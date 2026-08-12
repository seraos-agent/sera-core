const https = require('https');
require('dotenv').config();

const apiKey = process.env.QWEN_API || process.env.DASHSCOPE_API_KEY;

const data = JSON.stringify({
  model: "qwen-image-3.0",
  input: {
    messages: [
      {
        role: "user",
        content: [{ text: "A small cute pixel art cat" }]
      }
    ]
  },
  parameters: {
    prompt_extend: true
  }
});

const options = {
  hostname: 'dashscope-intl.aliyuncs.com',
  path: '/api/v1/services/aigc/multimodal-generation/generation',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + apiKey,
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log('Response:', JSON.stringify(JSON.parse(body), null, 2)));
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
