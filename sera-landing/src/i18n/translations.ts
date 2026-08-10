export type LanguageCode = 'en' | 'id' | 'zh';

type TranslationDictionary = {
  [key: string]: {
    en: string;
    id: string;
    zh: string;
  };
};

export const translations: TranslationDictionary = {
  'nav.select_language': { en: 'Select Language', id: 'Pilih Bahasa', zh: '选择语言' },
  'nav.home': { en: 'Home', id: 'Beranda', zh: '首页' },
  'nav.why': { en: 'What It Does', id: 'Apa Fungsinya', zh: '功能介绍' },
  'nav.features': { en: 'How It Helps', id: 'Cara Membantu', zh: '如何帮助' },
  'nav.how': { en: 'How It Works', id: 'Cara Kerjanya', zh: '工作原理' },
  'nav.use_cases': { en: 'Use Cases', id: 'Contoh Kasus', zh: '应用场景' },
  'nav.try': { en: 'FAQ', id: 'FAQ', zh: '常见问题解答' },
  'nav.products': { en: 'Products', id: 'Produk', zh: '产品' },
  'nav.developers': { en: 'Developers', id: 'Pengembang', zh: '开发者' },

  // Hero Section
  'hero.badge': { en: 'SERA · Your AI Agent', id: 'SERA · Asisten AI Anda', zh: 'SERA · 您的 AI 助手' },
  'hero.title': { en: 'Your AI Agent That Actually Gets Things Done', id: 'Agen AI Anda yang Benar-Benar Bertindak', zh: '真正帮您完成任务的 AI 代理' },
  'hero.subtitle': { en: 'Transfer money, automate payments, and connect your favorite apps just tell SERA what you need in plain language.', id: 'Transfer uang, otomatiskan pembayaran, dan hubungkan aplikasi favorit Anda cukup bilang ke SERA dengan bahasa sehari-hari.', zh: '转账、自动付款，并连接您最喜欢的应用程序 只需用日常语言告诉 SERA 您的需求。' },
  'hero.launch': { en: 'Launch', id: 'Luncurkan', zh: '启动' },
  'hero.learn': { en: 'Learn More', id: 'Pelajari Lebih Lanjut', zh: '了解更多' },
  'hero.stats': { en: 'Instant Transfers  •  Auto-Pay Bills  •  Universal Connectors', id: 'Transfer Instan  •  Bayar Tagihan Otomatis  •  Konektor Universal', zh: '即时转账  •  自动支付账单  •  通用连接器' },

  // Launch Modal
  'modal.badge': { en: 'SERA · CONTROLLED RELEASE', id: 'SERA · RILIS TERKENDALI', zh: 'SERA · 受控发布' },
  'modal.title': { en: 'Your Operational Partner is preparing for public access.', id: 'Mitra Operasional Anda sedang bersiap untuk akses publik.', zh: '您的运营伙伴正在准备向公众开放。' },
  'modal.desc': { en: 'The private application is currently in a controlled release. You can continue exploring SERA through the public Reception, or contact us directly.', id: 'Aplikasi privat saat ini dalam rilis terkendali. Anda dapat terus menjelajahi SERA melalui area Resepsionis publik, atau hubungi kami langsung.', zh: '私人应用程序目前处于受控发布阶段。您可以继续通过公共接待区探索 SERA，或直接与我们联系。' },
  'modal.button': { en: 'Return to Reception', id: 'Kembali ke Resepsionis', zh: '返回接待区' },

  // Workflow Nodes
  'workflow.user_intent': { en: 'Your Request', id: 'Permintaan Anda', zh: '您的请求' },
  'workflow.read_state': { en: 'Check Status', id: 'Cek Status', zh: '检查状态' },
  'workflow.validate': { en: 'Review Plan', id: 'Tinjau Rencana', zh: '审查计划' },
  'workflow.execute': { en: 'Get It Done', id: 'Selesaikan', zh: '完成任务' },

  // Search / Prompts
  'search.placeholder': { en: 'Ask SERA to...', id: 'Minta SERA untuk...', zh: '让 SERA...' },
  'prompt.buy': { en: 'Set up daily buy...', id: 'Atur pembelian harian...', zh: '设置每日定投...' },
  'prompt.wallet': { en: 'Deploy new wallet...', id: 'Deploy dompet baru...', zh: '部署新钱包...' },
  'prompt.check': { en: 'Run compliance check...', id: 'Jalankan cek kepatuhan...', zh: '运行合规检查...' },

  // Footer
  'footer.description': { en: 'Your AI assistant for transfers, payments, and portfolio management.', id: 'Asisten AI Anda untuk transfer, pembayaran, dan manajemen portofolio.', zh: '您的 AI 助手，用于转账、支付和投资组合管理。' },
  'footer.system_operational': { en: 'All Systems Operational', id: 'Semua Sistem Beroperasi', zh: '所有系统运行正常' },
  'footer.community': { en: 'Community', id: 'Komunitas', zh: '社区' },
  'footer.rights': { en: '© 2026 SERA OS. All rights reserved.', id: '© 2026 SERA OS. Hak cipta dilindungi undang-undang.', zh: '© 2026 SERA OS. 保留所有权利。' },

  // Section 2: What SERA Can Do (formerly "Why SERA")
  'why.badge': { en: 'WHAT SERA CAN DO', id: 'APA YANG BISA SERA LAKUKAN', zh: 'SERA 能做什么' },
  'why.title': { en: 'Real Solutions for Everyday Tasks', id: 'Solusi Nyata untuk Tugas Sehari-hari', zh: '日常任务的真实解决方案' },
  'why.subtitle': { en: 'No complicated apps or confusing steps. Just tell SERA what you need it handles the rest.', id: 'Tanpa aplikasi rumit atau langkah membingungkan. Cukup bilang ke SERA apa yang Anda butuhkan.', zh: '无需复杂的应用程序或令人困惑的步骤。只需告诉 SERA 您需要什么。' },
  'why.card1.title': { en: 'Send & Receive Money', id: 'Kirim & Terima Uang', zh: '收发资金' },
  'why.card1.desc': { en: 'Transfer USDC to anyone, anytime. Just say who and how much SERA does the rest securely.', id: 'Transfer USDC ke siapapun, kapanpun. Cukup sebutkan tujuan dan jumlahnya SERA mengurusnya dengan aman.', zh: '随时向任何人转账 USDC。只需说明对象和金额 SERA 会安全完成。' },
  'why.card2.title': { en: 'Automate Recurring Payments', id: 'Otomatiskan Pembayaran Rutin', zh: '自动化定期付款' },
  'why.card2.desc': { en: "Pay bills every Friday, schedule weekly savings, or set up automatic transfers SERA remembers so you don't have to.", id: 'Bayar tagihan tiap Jumat, atur tabungan mingguan, atau jadwalkan transfer otomatis SERA yang ingat untuk Anda.', zh: '每周五支付账单、安排每周储蓄或设置自动转账 SERA 替您记住 切。' },
  'why.card3.title': { en: 'Track Your Portfolio', id: 'Pantau Portofolio Anda', zh: '追踪您的投资组合' },
  'why.card3.desc': { en: 'See your wallet balance, transaction history, and asset performance in real-time just ask.', id: 'Lihat saldo dompet, riwayat transaksi, dan performa aset secara real-time cukup tanyakan.', zh: '实时查看钱包余额、交易记录和资产表现 问 下就好。' },

  // Section 3: How SERA Helps (formerly "Core Capabilities")
  'core.badge': { en: 'HOW SERA HELPS', id: 'BAGAIMANA SERA MEMBANTU', zh: 'SERA 如何帮助' },
  'core.title': { en: 'Simple for You, Powerful Underneath', id: 'Sederhana untuk Anda, Canggih di Dalamnya', zh: '简单易用，内核强大' },
  'core.subtitle': { en: 'You speak naturally. SERA understands, plans, and acts always with your permission.', id: 'Anda bicara secara alami. SERA memahami, merencanakan, dan bertindak selalu dengan izin Anda.', zh: '您自然地表达。SERA 理解、规划并行动 始终经过您的许可。' },
  'core.card1.title': { en: 'Just Talk, SERA Acts', id: 'Bicara Saja, SERA Bertindak', zh: '说就行，SERA 来做' },
  'core.card1.desc': { en: "No buttons to learn, no menus to navigate. Say what you need like you'd text a friend.", id: 'Tidak ada tombol yang perlu dipelajari. Sampaikan kebutuhan Anda seperti mengirim pesan ke teman.', zh: '无需学习按钮，无需浏览菜单。像给朋友发消息 样表达需求。' },
  'core.card2.title': { en: 'Smart Planning, Zero Effort', id: 'Perencanaan Cerdas, Tanpa Ribet', zh: '智能规划，零负担' },
  'core.card2.desc': { en: 'SERA breaks down your request into clear steps and shows you the plan before doing anything.', id: 'SERA memecah permintaan Anda menjadi langkah-langkah jelas dan menunjukkan rencana sebelum bertindak.', zh: 'SERA 将您的请求分解为清晰的步骤，并在执行前向您展示计划。' },
  'core.card3.title': { en: 'Works With Your Wallet', id: 'Terhubung dengan Dompet Anda', zh: '连接您的钱包' },
  'core.card3.desc': { en: 'Connected to your crypto wallet, payment tools, and more all in one place.', id: 'Terhubung ke dompet crypto, alat pembayaran, dan lainnya semua dalam satu tempat.', zh: '连接您的加密钱包、支付工具等 站式管理。' },
  'core.card4.title': { en: 'Always Asks Your Permission', id: 'Selalu Minta Izin Anda', zh: '始终征求您的许可' },
  'core.card4.desc': { en: 'SERA never moves your money without showing you exactly what it will do first. You approve or reject.', id: 'SERA tidak pernah memindahkan uang Anda tanpa menunjukkan rencana terlebih dahulu. Anda yang setujui atau tolak.', zh: 'SERA 绝不会在未向您展示计划前动您的资金。由您批准或拒绝。' },

  // Section 4: How It Works
  'how.badge': { en: 'HOW IT WORKS', id: 'CARA KERJANYA', zh: '工作原理' },
  'how.title': { en: 'As Easy as 1-2-3', id: 'Semudah 1-2-3', zh: '简单三步' },
  'how.subtitle': { en: 'From your request to real action in seconds.', id: 'Dari permintaan Anda menjadi aksi nyata dalam hitungan detik.', zh: '从您的请求到实际行动 只需几秒。' },
  'how.step1.title': { en: 'Tell SERA What You Need', id: 'Bilang ke SERA Apa yang Anda Butuhkan', zh: '告诉 SERA 您需要什么' },
  'how.step1.desc': { en: "Type something like 'Send 50 USDC to Alex' or 'Pay rent every month' in any language.", id: "Ketik sesuatu seperti 'Kirim 50 USDC ke Alex' atau 'Bayar sewa tiap bulan' dalam bahasa apapun.", zh: "输入类似'给 Alex 转 50 USDC'或'每月支付房租' 用任何语言。" },
  'how.step2.title': { en: 'SERA Shows You The Plan', id: 'SERA Tunjukkan Rencananya', zh: 'SERA 向您展示计划' },
  'how.step2.desc': { en: 'Before doing anything, SERA shows a clear summary of what it will do. No surprises.', id: 'Sebelum melakukan apapun, SERA menunjukkan ringkasan jelas tentang apa yang akan dilakukan. Tanpa kejutan.', zh: '在执行任何操作前，SERA 会清晰展示将要做什么。没有意外。' },
  'how.step3.title': { en: 'You Approve, SERA Executes', id: 'Anda Setujui, SERA Eksekusi', zh: '您批准，SERA 执行' },
  'how.step3.desc': { en: 'One tap to approve. SERA completes the task and shows you a confirmation with all the details.', id: 'Satu ketukan untuk menyetujui. SERA menyelesaikan tugas dan menampilkan konfirmasi lengkap.', zh: '键批准。SERA 完成任务并显示包含所有详情的确认信息。' },

  // Section 5: Integrations (formerly "Universal Agent OS")
  'os.badge': { en: 'INTEGRATIONS', id: 'INTEGRASI', zh: '集成' },
  'os.title': { en: 'Connected to What Matters', id: 'Terhubung ke yang Penting', zh: '连接重要的 切' },
  'os.subtitle': { en: "SERA works with leading crypto wallets, payment rails, and data providers so you don't need multiple apps.", id: 'SERA bekerja dengan dompet crypto, jalur pembayaran, dan penyedia data terkemuka sehingga Anda tidak perlu banyak aplikasi.', zh: 'SERA 与领先的加密钱包、支付通道和数据提供商合作 无需多个应用。' },

  // Section 5.5: Demo
  'demo.badge': { en: 'PRODUCT DEMO', id: 'DEMO PRODUK', zh: '产品演示' },
  'demo.title': { en: 'See SERA in Action', id: 'Lihat SERA Beraksi', zh: '观看 SERA 演示' },
  'demo.subtitle': { en: 'Watch how a simple request becomes a real, completed task.', id: 'Lihat bagaimana permintaan sederhana menjadi tugas yang benar-benar selesai.', zh: '看 个简单的请求如何变成 个真正完成的任务。' },
  'demo.play': { en: 'Play Demo', id: 'Putar Demo', zh: '播放演示' },

  // Idle Scene
  'idle.badge': { en: 'TRY IT YOURSELF', id: 'COBA SENDIRI', zh: '亲自体验' },
  'idle.title': { en: 'See What SERA Can Do', id: 'Lihat Apa yang Bisa SERA Lakukan', zh: '看看 SERA 能做什么' },
  'idle.subtitle': { en: "Tap a question below to try SERA's live Reception assistant.", id: 'Ketuk pertanyaan di bawah untuk mencoba asisten Resepsionis SERA.', zh: '点击下方问题体验 SERA 的实时接待助手。' },
  'idle.cat.intro': { en: 'GET STARTED', id: 'MULAI', zh: '开始' },
  'idle.cat.cap': { en: 'EVERYDAY USE', id: 'PENGGUNAAN HARIAN', zh: '日常使用' },
  'idle.cat.sec': { en: 'YOUR SAFETY', id: 'KEAMANAN ANDA', zh: '您的安全' },
  'idle.cat.int': { en: 'CONNECTIONS', id: 'KONEKSI', zh: '连接' },
  'idle.prompt1': { en: 'What is SERA and how can it help me?', id: 'Apa itu SERA dan bagaimana bisa membantu saya?', zh: '什么是 SERA，它如何帮助我？' },
  'idle.prompt2': { en: 'Can SERA send money for me automatically?', id: 'Bisakah SERA mengirim uang untuk saya secara otomatis?', zh: 'SERA 能自动帮我转账吗？' },
  'idle.prompt3': { en: 'How does SERA protect my money?', id: 'Bagaimana SERA melindungi uang saya?', zh: 'SERA 如何保护我的资金？' },
  'idle.prompt4': { en: 'What apps and wallets work with SERA?', id: 'Aplikasi dan dompet apa saja yang bisa digunakan dengan SERA?', zh: 'SERA 支持哪些应用和钱包？' },
  'idle.try': { en: 'Try This Prompt', id: 'Coba Prompt Ini', zh: '尝试此提示' }
};
