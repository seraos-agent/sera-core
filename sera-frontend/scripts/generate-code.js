const crypto = require('crypto');

const code = process.argv[2];

if (!code) {
  console.log("⚠️ Penggunaan: node generate-code.js \"KODE-ANDA\"");
  console.log("Contoh: node generate-code.js \"SERA-VIP-99\"");
  process.exit(1);
}

const hash = crypto.createHash('sha256').update(code.trim()).digest('hex');

console.log("\n✅ Kode berhasil di-hash!");
console.log("--------------------------------------------------");
console.log(`Kode Asli : ${code}`);
console.log(`Hash      : '${hash}'`);
console.log("--------------------------------------------------");
console.log("\nLangkah selanjutnya:");
console.log("1. Copy baris Hash di atas (termasuk tanda kutipnya).");
console.log("2. Paste ke dalam array VALID_LAUNCH_CODE_HASHES di file: src/config/launchCodes.ts");
console.log("3. Deploy ulang dengan: vercel --prod\n");
