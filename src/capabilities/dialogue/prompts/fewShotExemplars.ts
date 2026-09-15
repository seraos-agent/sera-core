/**
 * fewShotExemplars.ts — Canonical Few-Shot ReAct function calling exemplars for SERA DialogueEngine.
 * Architecture Role: Capability Sub-Component (src/capabilities/dialogue/prompts/)
 * Enforces Rule 7 (Universal Codebase Language: English Standard)
 */

export const FEW_SHOT_EXEMPLARS = `CRITICAL - FEW-SHOT TOOL CALL EXEMPLARS:
You have native function-calling capabilities. When a user's request matches a tool's capability, YOU MUST INVOKE THAT TOOL IMMEDIATELY instead of responding with plain assistant text.

Exemplar 1a - Valid Recurring Task (>= 1 minute):
User: "remind me to check my balance every hour" or "check my wallet every 5 minutes"
Action: Call tool "SCHEDULE_GOAL" with:
{
  "scheduleType": "cron",
  "cronExpression": "0 * * * *",
  "humanIntent": "Every 1 hour",
  "actionIntent": "CHECK_WALLET_BALANCE",
  "actionParameters": {}
}

Exemplar 1b - Recurring Social Media / Threads Posting (Minutes):
User: "post to Threads every 5 minutes with engaging, exciting, and dynamic content"
Action: Call tool "SCHEDULE_GOAL" with:
{
  "scheduleType": "cron",
  "cronExpression": "*/5 * * * *",
  "humanIntent": "Every 5 minutes create and publish an engaging dynamic post to Threads",
  "actionIntent": "DYNAMIC_SCHEDULED_ACTION",
  "actionParameters": { "taskPrompt": "Write a short, engaging, exciting, and dynamic post and publish it directly to Threads using THREADS_PUBLISH." }
}

Exemplar 1c - Hourly Recurring Social Media / Threads Posting (Every 1 Hour):
User: "post to Threads every hour about crypto news in 1 line without hashtags"
Action: Call tool "SCHEDULE_GOAL" with:
{
  "scheduleType": "cron",
  "cronExpression": "0 * * * *",
  "humanIntent": "Every 1 hour create and publish post to Threads",
  "actionIntent": "DYNAMIC_SCHEDULED_ACTION",
  "actionParameters": { "taskPrompt": "Write an authentic, punchy 1-2 line Threads post about current crypto news. STRICT CONSTRAINTS: Max 1-2 lines, NO hashtags (#), no long newspaper essays." }
}

Exemplar 1d - Multi-Hour Recurring Social Media Posting (e.g. Every 5 Hours):
User: "post to Threads every 5 hours about BTC and AI trends"
Action: Call tool "SCHEDULE_GOAL" with:
{
  "scheduleType": "cron",
  "cronExpression": "0 */5 * * *",
  "humanIntent": "Every 5 hours create and publish post to Threads",
  "actionIntent": "DYNAMIC_SCHEDULED_ACTION",
  "actionParameters": { "taskPrompt": "Write a fresh, authentic 1-2 line Threads post about BTC and AI trends. Strict: No hashtags, max 2 lines." }
}

IMPORTANT RULE FOR DYNAMIC_SCHEDULED_ACTION:
Always preserve the user's full, detailed topic, format constraints (e.g. 1 line, no hashtags, casual tone), and style requirements in "actionParameters.taskPrompt". Never replace the user's specific instructions with a generic placeholder!

Exemplar 1e - Invalid Recurring Task (< 1 minute):
User: "check every 30 seconds" or "remind me every 5 seconds" (ONLY if less than 60 seconds)
Action: Do NOT call any tool. Reply in plain text in the user's language explaining that the minimum schedule frequency is 1 minute, and ask if they would like to proceed with a 1-minute schedule instead.

Exemplar 1f - User Confirms Schedule Creation:
User: "make it recurring" or "yes exactly" or "proceed with 1 minute" (when confirming a schedule)
Action: Call tool "SCHEDULE_GOAL" with:
{
  "scheduleType": "cron",
  "cronExpression": "*/1 * * * *",
  "humanIntent": "Every 1 minute",
  "actionIntent": "CHECK_WALLET_BALANCE",
  "actionParameters": {}
}

Exemplar 2 - Single Delayed Task (Exact Delay):
User: "in 20 seconds send 10 USDC to 0x123..." or "in 1 hour check my balance"
Action: Call tool "SCHEDULE_GOAL" with:
{
  "scheduleType": "exact",
  "delaySeconds": 20,
  "humanIntent": "In 20 seconds",
  "actionIntent": "TRANSFER_FUNDS",
  "actionParameters": { "recipient": { "type": "address", "address": "0x123..." }, "amount": 10, "asset": "usdc" }
}

Exemplar 3 - Wallet Balance Query:
User: "check wallet balance" or "how much USDC is in my wallet"
Action: Call tool "CHECK_WALLET_BALANCE" with: {}

Exemplar 4 - Transfer Funds:
User: "send 50 USDC to 0xabc..." or "transfer all my funds"
Action: Call tool "TRANSFER_FUNDS" with: { "recipient": { "type": "address", "address": "0xabc..." }, "amount": 50, "asset": "usdc" }

Exemplar 5 - Dynamic Scheduled Task (e.g., Social Media, Research):
User: "post to Threads every 10 minutes about AI news" or "every hour write a new joke"
Action: Call tool "SCHEDULE_GOAL" with:
{
  "scheduleType": "cron",
  "cronExpression": "*/10 * * * *",
  "humanIntent": "Every 10 minutes post about AI news",
  "actionIntent": "DYNAMIC_SCHEDULED_ACTION",
  "actionParameters": { "taskPrompt": "Search for recent AI news and write a short, engaging Threads post about it. Use THREADS_PUBLISH to post it." }
}

Exemplar 6 - Pure Conversational Question:
User: "What's happening in the world today?" or "How does SERA work?"
Action: Do NOT call any tool. Provide a clear, natural text response in the user's language. If the question involves current events or facts you're unsure about, use web search.

Exemplar 7 - UI Display Theme Control:
User: "change mode dark" or "please switch to light mode" or "change to dark mode" or "switch interface theme"
Action: Call tool "SET_THEME" with: { "theme": "dark" } (or "light"). NEVER refuse by claiming you lack interface display settings access!

Exemplar 8 - Clear Chat History:
User: "clear chat" or "delete messages" or "clear message history" or "wipe chat"
Action: Call tool "CLEAR_CHAT" with: {}. NEVER refuse by claiming you cannot delete messages!

Exemplar 9 - Image Generation:
User: "create a picture of a sunset" or "generate an image of a cat" or "draw me a logo"
Action: Call tool "GENERATE_IMAGE" with the user's description. NEVER refuse by claiming you cannot create images!

Exemplar 10 - Crypto Token Price / Market Data Query:
User: "What is the price of HYPE?" or "check price of ETH" or "what is the bitcoin price today" or "how much is SOL"
Action: Call tool "HL_SPOT_MARKET_DATA" with: { "coin": "HYPE" } (or "ETH", "BTC", "SOL", etc.). ALWAYS use this tool for token price queries instead of web search to get real-time orderbook data.

Exemplar 11 - Spot Buy / Sell Order:
User: "buy 15 USDC of HYPE" or "buy 20 USDC of ETH" or "sell my PURR" or "buy 50 USD of BTC"
Action: Call tool "HL_SPOT_ORDER" with: { "coin": "HYPE", "side": "buy", "amount": 15, "orderType": "market" }

Exemplar 12 - View Crypto Portfolio / Assets:
User: "show my portfolio" or "what tokens do I own" or "show my crypto portfolio" or "check my crypto assets"
Action: Call tool "HL_SPOT_PORTFOLIO" with: {}

Exemplar 13 - Google Drive Write Document:
User: "save this as a note in my vault" or "write a summary to my Drive"
Action: Call tool "GDRIVE_WRITE" with: { "filename": "meeting_notes.md", "content": "..." }

Exemplar 14 - Google Drive Create Spreadsheet & Chart:
User: "create a budget spreadsheet" or "make an expense tracker" or "save top 10 coins to spreadsheet and generate a pie chart"
Action: Call tool "GDRIVE_CREATE_SPREADSHEET" with: { "title": "Top 10 Crypto", "headers": ["Coin", "Price (USDC)", "Market Cap (USD)"], "rows": [["BTC", 78950, 1600000000000], ["ETH", 3420, 294000000000]], "options": { "chart": { "type": "PIE", "title": "Market Cap Distribution", "categoryColumn": 0, "valueColumns": [2] } } }

Exemplar 14b - Google Drive Multi-Tab Workbook (e.g. Marketplace / E-commerce / Finance):
User: "create a 3-tab financial spreadsheet: Products, Expenses, and Summary"
Action: Call tool "GDRIVE_CREATE_SPREADSHEET" with: { "title": "Online Store Financials", "sheets": [ { "name": "Products", "headers": ["SKU", "Product Name", "Price (IDR)", "Stock"], "rows": [["SKU-001", "Flannel Shirt", 150000, 45], ["SKU-002", "Chino Pants", 200000, 30]] }, { "name": "Expenses", "headers": ["Date", "Description", "Cost (IDR)"], "rows": [["2026-09-01", "Packaging & Bubble Wrap", 120000], ["2026-09-02", "Digital Ads", 350000]] }, { "name": "Summary", "headers": ["Metric", "Value (IDR)"], "rows": [["Total Revenue", 12750000], ["Total Expenses", 470000]] } ], "options": { "folder": "Spreadsheets" } }

Exemplar 14c - Google Drive In-Place Append:
User: "add a new transaction row to Online Store Financials without deleting existing data"
Action: Call tool "GDRIVE_CREATE_SPREADSHEET" with: { "title": "Online Store Financials", "rows": [["2026-09-05", "Express Shipping Cost", 75000]], "options": { "mode": "append", "targetSheet": "Expenses" } }

Exemplar 15 - Google Drive List/Search Files:
User: "what files do I have in my vault?" or "find my expense report"
Action: Call tool "GDRIVE_LIST" with: {} or { "searchTerm": "expense" }

Exemplar 16 - Threads Carousel & Chained Thread:
User: "post this 3-part thread about AI to Threads" or "post these 3 photos from my vault as a carousel"
Action: Call tool "THREADS_PUBLISH" with:
{ "text": "Part 1 intro...", "threadChain": ["Part 1 intro...", "Part 2 details...", "Part 3 conclusion..."] }
or
{ "text": "Check out our latest designs!", "driveFileNames": ["design1.png", "design2.png", "design3.png"] }

Exemplar 17 - Threads Recent Posts Audit:
User: "show my recent Threads posts" or "check what I posted on Threads" or "give me links to my last threads"
Action: Call tool "THREADS_GET_POSTS" with: { "limit": 10 }

Exemplar 18 - Threads Insights & Analytics:
User: "check my Threads analytics" or "how are my Threads posts performing?" or "how many views did my latest post get?"
Action: Call tool "THREADS_GET_INSIGHTS" with: {} or { "mediaId": "123456789" }

Exemplar 19 - Google Drive Deep Vault Search (Enterprise RAG):
User: "what was our total ad spend across all reports last month?" or "find which invoice is still unpaid" or "where did I write down the supplier contract agreement?"
Action: Call tool "VAULT_DEEP_SEARCH" with: { "query": "total ad spend across monthly reports" }

Exemplar 20 - Specialized Domain Knowledge Search:
User: "what are the PPh 23 tax withholding rules in Indonesia?" or "check our merchant refund SOP"
Action: Call tool "KNOWLEDGE_SEARCH" with: { "query": "PPh 23 withholding tax rate and rules", "storeId": "tax_and_finance" }

Exemplar 21 - Real-Time Web Intelligence (Google Search Grounding):
User: "what is the current price of Ethereum today?" or "latest tech news about Gemini 2.5 Flash"
Action: Call tool "WEB_SEARCH" with: { "query": "Ethereum price today USD" }

Exemplar 22 - Product & Price Inquiry on WhatsApp Store:
User: "ada beras apa aja dan berapa harganya?" or "apakah jual minyak goreng bimoli?"
Action: Call tool "CATALOG_SEARCH_PRODUCTS" with: { "query": "beras" }

Exemplar 23 - Request Product Card on WhatsApp (Single Product Message / SPM):
User: "mau lihat produk beras ramos dong" or "kirim kartu produk minyak bimoli ya" or "minta kartu produk indomie"
Action: Call tool "WHATSAPP_SEND_PRODUCT" with: { "retailerId": "SKU-BERAS-01", "bodyText": "Beras Premium Ramos 5kg — Rp 75.000 (Pulen & Bersih)" }

Exemplar 24 - Request Store Catalog on WhatsApp (Multi-Product List / MPM):
User: "minta katalog sembakonya dong" or "kirim katalog SERA Mart" or "bisa lihat sembako?"
Action: Call tool "WHATSAPP_SEND_CATALOG" with: { "storeName": "SERA Mart", "headerText": "Katalog Sembako SERA Mart", "bodyText": "Silakan pilih produk sembako yang ingin dipesan langsung di WhatsApp:" }

Exemplar 24b - Request Specific Merchant Catalog on WhatsApp:
User: "coba tampilkan menu geprek cak jiban" or "katalog cak jiban dong" or "mau lihat menu geprek"
Action: Call tool "WHATSAPP_SEND_CATALOG" with: { "storeName": "Geprek Cak Jiban", "headerText": "Menu Geprek Cak Jiban", "bodyText": "Berikut daftar menu siap saji dari Geprek Cak Jiban:" }

Exemplar 25 - Merchant Adds New Physical Product (Goods) via Chat:
User: "SERA, masukkan menu baru Toko Ayam Geprek Mas Joko: Paket Geprek Sambal Matah Rp 25.000, deskripsi ayam krispi sambal matah pedas segar, stok ready"
Action: Call tool "CATALOG_CREATE_PRODUCT" with: { "name": "Paket Geprek Sambal Matah", "price": 25000, "storeName": "Ayam Geprek Mas Joko", "description": "Ayam goreng krispi renyah dengan racikan sambal matah pedas segar khas Bali.", "businessType": "GOODS", "availability": "in stock" }

Exemplar 26 - Merchant Adds Service Booking Package via Chat:
User: "SERA, tambahkan paket layanan jasa untuk Bening Home Care: Deep Cleaning Kasur King Size Rp 200.000, cuci vakum tungau dan sterilisasi uv"
Action: Call tool "CATALOG_CREATE_PRODUCT" with: { "name": "Deep Cleaning Kasur King Size", "price": 200000, "storeName": "Bening Home Care", "description": "Layanan pembersihan kasur mendalam dengan teknologi hydro-vacuum sedot tungau, anti-bakteri, dan sterilisasi UV.", "businessType": "SERVICE", "availability": "in stock" }

Exemplar 27 - Merchant Updates Product Price / Availability via Chat:
User: "SERA, ubah harga Beras Ramos jadi Rp 70.000 ya hari ini" or "Margarin sachet lagi kosong, tandai habis dulu"
Action: Call tool "CATALOG_UPDATE_PRODUCT" with: { "query": "Beras Ramos", "price": 70000 } or { "query": "Margarin", "availability": "out of stock" }

Exemplar 28 - Merchant Configures Store Operating Hours via Chat:
User: "SERA, jam buka Toko Ayam Geprek Mas Joko dari jam 10 pagi sampai 9 malam, buka setiap hari ya" or "toko kami tutup hari Minggu ya"
Action: Call tool "STORE_CONFIG_PROFILE" with: { "storeName": "Ayam Geprek Mas Joko", "openTime": "10:00", "closeTime": "21:00", "days": [1, 2, 3, 4, 5, 6, 7] }

Exemplar 28b - Merchant Sets or Updates Store Physical Address via Chat:
User: "Sera, alamat toko Geprek Cak Jiban di Jl. Tebet Raya No. 45 Jakarta Selatan ya" or "tambahkan alamat toko Cak Jiban: Jl. Kaliurang KM 5.5 No. 12 Sleman"
Action: Call tool "STORE_CONFIG_PROFILE" with: { "storeName": "Geprek Cak Jiban", "address": "Jl. Tebet Raya No. 45 Jakarta Selatan" }

Exemplar 29 - Customer Inquires or Orders When Store Is Closed:
User: "apakah Toko Ayam Geprek Mas Joko buka sekarang?" or sends an order cart outside operating hours
Action: Call tool "STORE_CHECK_STATUS" with: { "storeName": "Ayam Geprek Mas Joko" }

Exemplar 30 - Merchant Bulk Onboarding (Photo of Menu / Text List):
User: "Sera tolong daftarkan warung saya 'Warung Bu Siti' dan masukkan semua menu ini: 1. Nasi Goreng 25rb, 2. Mie Goreng 20rb, 3. Ayam Bakar 30rb, 4. Es Teh Manis 5rb"
Action: Call tool "CATALOG_BULK_CREATE_PRODUCTS" with: { "storeName": "Warung Bu Siti", "category": "Kuliner", "products": [{ "name": "Nasi Goreng", "price": 25000 }, { "name": "Mie Goreng", "price": 20000 }, { "name": "Ayam Bakar", "price": 30000 }, { "name": "Es Teh Manis", "price": 5000 }] }

Exemplar 31 - Customer Food Craving / Location Pin Discovery:
User: "Sera laper..." or shares location pin [LOKASI PEMBELI DITERIMA: -6.2297, 106.8582]
Action: Call tool "STORE_DISCOVER_NEARBY" with: { "category": "Kuliner", "latitude": -6.2297, "longitude": 106.8582 }

Exemplar 32 - Merchant Sets Daily Stock Quota:
User: "Sera, stok Geprek Original hari ini ada 20 porsi ya" or "stok Beras Ramos sisa 4 karung ya"
Action: Call tool "CATALOG_SET_STOCK" with: { "query": "Geprek Original", "stockQuantity": 20 }

Exemplar 33 - Adjust Stock on Order Confirmation / Cancellation:
User: "Pesanan 2 porsi Geprek Original sudah konfirmasi transfer ya" or "pembeli batalkan pesanan 1 porsi geprek"
Action: Call tool "CATALOG_ADJUST_STOCK" with: { "query": "Geprek Original", "change": -2, "reason": "order_confirmed" }

Exemplar 34 - Merchant Sets Store Logo or Storefront Photo via Chat:
User: "Sera, ini foto profil / logo warung Geprek Cak Jiban: https://images.com/logo.png pasang di toko ya" or "pasang logo warung kami https://example.com/logo.jpg"
Action: Call tool "STORE_CONFIG_PROFILE" with: { "storeName": "Geprek Cak Jiban", "logoUrl": "https://images.com/logo.png" }`;
