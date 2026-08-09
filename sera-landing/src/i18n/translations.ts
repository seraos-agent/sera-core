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
  'nav.why': { en: 'Why SERA', id: 'Mengapa SERA', zh: '为什么选择 SERA' },
  'nav.features': { en: 'Features', id: 'Fitur', zh: '功能' },
  'nav.how': { en: 'How It Works', id: 'Cara Kerjanya', zh: '工作原理' },
  'nav.use_cases': { en: 'Use Cases', id: 'Contoh Kasus', zh: '应用场景' },
  'nav.try': { en: 'FAQ', id: 'FAQ', zh: '常见问题解答' },
  'nav.products': { en: 'Products', id: 'Produk', zh: '产品' },
  'nav.developers': { en: 'Developers', id: 'Pengembang', zh: '开发者' },
  
  // Hero Section
  'hero.title': { en: 'Autonomous Intelligence That Executes Your Intent', id: 'Kecerdasan Otonom yang Mengeksekusi Niat Anda', zh: '执行您意图的自主智能' },
  'hero.subtitle': { en: 'Beyond standard text responses. SERA evaluates real-world state, formulates actionable plans, and securely executes workflows for you.', id: 'Lebih dari sekadar respons teks standar. SERA mengevaluasi status dunia nyata, merumuskan rencana, dan mengeksekusi alur kerja dengan aman untuk Anda.', zh: '超越标准文本响应。SERA 评估真实世界状态，制定可行计划，并为您安全执行工作流程。' },
  'hero.launch': { en: 'Launch', id: 'Luncurkan', zh: '启动' },
  'hero.learn': { en: 'Learn More', id: 'Pelajari Lebih Lanjut', zh: '了解更多' },
  'hero.stats': { en: '100% Autonomous Planning  •  Real-Time WorldState  •  Verifiable Safeguards', id: '100% Perencanaan Otonom  •  WorldState Real-Time  •  Pengamanan Terverifikasi', zh: '100% 自主规划  •  实时世界状态  •  可验证的安全保障' },
  
  // Workflow Nodes
  'workflow.user_intent': { en: 'User Intent', id: 'Niat Pengguna', zh: '用户意图' },
  'workflow.read_state': { en: 'Read State', id: 'Baca Status', zh: '读取状态' },
  'workflow.validate': { en: 'Validate', id: 'Validasi', zh: '验证' },
  'workflow.execute': { en: 'Execute', id: 'Eksekusi', zh: '执行' },
  
  // Search / Prompts
  'search.placeholder': { en: 'Ask SERA to...', id: 'Minta SERA untuk...', zh: '让 SERA...' },
  'prompt.buy': { en: 'Set up daily buy...', id: 'Atur pembelian harian...', zh: '设置每日定投...' },
  'prompt.wallet': { en: 'Deploy new wallet...', id: 'Deploy dompet baru...', zh: '部署新钱包...' },
  'prompt.check': { en: 'Run compliance check...', id: 'Jalankan cek kepatuhan...', zh: '运行合规检查...' },
  
  // Footer
  'footer.description': { en: 'The universal AI agent engine. Secure, autonomous, and verifiable.', id: 'Mesin agen AI universal. Aman, otonom, dan dapat diverifikasi.', zh: '通用的 AI 代理引擎。安全，自主，可验证。' },
  'footer.system_operational': { en: 'All Systems Operational', id: 'Semua Sistem Beroperasi', zh: '所有系统运行正常' },
  'footer.community': { en: 'Community', id: 'Komunitas', zh: '社区' },
  'footer.rights': { en: '© 2026 SERA OS. All rights reserved.', id: '© 2026 SERA OS. Hak cipta dilindungi undang-undang.', zh: '© 2026 SERA OS. 保留所有权利。' },

  // Section 2: Why SERA
  'why.badge': { en: 'WHY SERA', id: 'MENGAPA SERA', zh: '为什么选择 SERA' },
  'why.title': { en: 'Bridging Natural Intent With Complex Execution', id: 'Menjembatani Niat Alami Dengan Eksekusi Kompleks', zh: '将自然意图与复杂执行相结合' },
  'why.subtitle': { en: 'Designed for non-technical users to orchestrate intelligent workflows without needing engineering skills.', id: 'Dirancang bagi pengguna non-teknis untuk mengatur alur kerja cerdas tanpa keahlian pemrograman.', zh: '专为非技术用户设计，无需工程技能即可协调智能工作流程。' },
  'why.card1.title': { en: 'Zero Technical Friction', id: 'Nihil Gesekan Teknis', zh: '零技术门槛' },
  'why.card1.desc': { en: 'No syntax or complex commands to memorize. Simply express your goals in everyday human language.', id: 'Tidak ada sintaks atau perintah rumit. Cukup sampaikan tujuan Anda dalam bahasa sehari-hari.', zh: '无需记忆语法或复杂命令。只需用日常语言表达您的目标。' },
  'why.card2.title': { en: 'Real-World Execution', id: 'Eksekusi Dunia Nyata', zh: '真实世界执行' },
  'why.card2.desc': { en: 'Most AI tools stop at generating text. SERA constructs structured action plans and executes them for real.', id: 'Kebanyakan AI hanya menghasilkan teks. SERA menyusun rencana tindakan terstruktur dan benar-benar mengeksekusinya.', zh: '大多数 AI 工具仅停留在生成文本。SERA 构建结构化的行动计划并真正执行它们。' },
  'why.card3.title': { en: 'Real-Time State Awareness', id: 'Kesadaran Status Real-Time', zh: '实时状态感知' },
  'why.card3.desc': { en: 'SERA inspects live system state before acting, ensuring zero false assumptions during task execution.', id: 'SERA memeriksa status sistem secara langsung sebelum bertindak, memastikan tidak ada asumsi palsu.', zh: 'SERA 在行动前检查实时系统状态，确保任务执行期间零错误假设。' },

  // Section 3: Core Capabilities
  'core.badge': { en: 'CORE CAPABILITIES', id: 'KEMAMPUAN INTI', zh: '核心能力' },
  'core.title': { en: 'The Power Behind SERA OS', id: 'Kekuatan di Balik SERA OS', zh: 'SERA OS 的强大动力' },
  'core.subtitle': { en: 'Combining artificial intelligence, system automation, and verifiable human control.', id: 'Menggabungkan kecerdasan buatan, otomatisasi sistem, dan kontrol manusia yang dapat diverifikasi.', zh: '结合人工智能、系统自动化和可验证的人类控制。' },
  'core.card1.title': { en: 'Natural Language Interaction', id: 'Interaksi Bahasa Alami', zh: '自然语言交互' },
  'core.card1.desc': { en: 'Describe goals in your own words. SERA understands context and intent accurately.', id: 'Jelaskan tujuan dengan kata-kata Anda. SERA memahami konteks dan niat secara akurat.', zh: '用您自己的语言描述目标。SERA 准确理解上下文和意图。' },
  'core.card2.title': { en: 'Autonomous Planner', id: 'Perencana Otonom', zh: '自主规划器' },
  'core.card2.desc': { en: 'Decomposes complex requests into structured, step-by-step proposals automatically.', id: 'Memecah permintaan kompleks menjadi proposal terstruktur selangkah demi selangkah.', zh: '自动将复杂的请求分解为结构化、循序渐进的提案。' },
  'core.card3.title': { en: 'Multi-System & Web3 Connectors', id: 'Konektor Multi-Sistem & Web3', zh: '多系统与 Web3 连接器' },
  'core.card3.desc': { en: 'Integrates seamlessly with wallets, external APIs, data services, and automated tasks.', id: 'Terintegrasi mulus dengan dompet, API eksternal, layanan data, dan tugas otomatis.', zh: '与钱包、外部 API、数据服务和自动任务无缝集成。' },
  'core.card4.title': { en: 'Verifiable Control & Safeguards', id: 'Kontrol & Pengamanan Terverifikasi', zh: '可验证的控制与保障' },
  'core.card4.desc': { en: 'Critical actions require your explicit review and approval before execution.', id: 'Tindakan kritis memerlukan tinjauan dan persetujuan eksplisit Anda sebelum dieksekusi.', zh: '关键行动在执行前需要您的明确审查和批准。' },

  // Section 4: How It Works
  'how.badge': { en: 'HOW IT WORKS', id: 'CARA KERJANYA', zh: '工作原理' },
  'how.title': { en: 'In 3 Simple Steps', id: 'Dalam 3 Langkah Mudah', zh: '只需 3 个简单步骤' },
  'how.subtitle': { en: 'A transparent journey from initial instruction to verified outcome.', id: 'Perjalanan transparan dari instruksi awal hingga hasil yang terverifikasi.', zh: '从初始指令到验证结果的透明旅程。' },
  'how.step1.title': { en: 'Express Your Intent', id: 'Sampaikan Niat Anda', zh: '表达您的意图' },
  'how.step1.desc': { en: "Type your request or question in SERA's interactive console at the bottom of this page.", id: "Ketik permintaan atau pertanyaan Anda di konsol interaktif SERA di bagian bawah halaman ini.", zh: "在此页面底部的 SERA 交互式控制台中输入您的请求或问题。" },
  'how.step2.title': { en: 'SERA Formulates a Plan', id: 'SERA Merumuskan Rencana', zh: 'SERA 制定计划' },
  'how.step2.desc': { en: 'SERA evaluates real-time state, checks policy constraints, and builds a proposed action workflow.', id: 'SERA mengevaluasi status real-time, memeriksa batasan kebijakan, dan menyusun alur kerja.', zh: 'SERA 评估实时状态，检查策略限制，并构建拟议的行动工作流。' },
  'how.step3.title': { en: 'Execute & Verify', id: 'Eksekusi & Verifikasi', zh: '执行与验证' },
  'how.step3.desc': { en: 'Upon review, SERA completes the task safely and delivers transparent execution reports.', id: 'Setelah ditinjau, SERA menyelesaikan tugas dengan aman dan memberikan laporan eksekusi.', zh: '经过审查，SERA 安全完成任务并提供透明的执行报告。' },

  // Section 5: Universal OS
  'os.badge': { en: 'THE UNIVERSAL AGENT OS', id: 'OS AGEN UNIVERSAL', zh: '通用代理 OS' },
  'os.title': { en: 'An intelligence for every system', id: 'Kecerdasan untuk setiap sistem', zh: '适用于每个系统的智能' },
  'os.subtitle': { en: 'Connect the systems that matter. SERA turns context into clear, considered action, never without your intent.', id: 'Hubungkan sistem yang penting. SERA mengubah konteks menjadi tindakan nyata, tak pernah tanpa izin Anda.', zh: '连接重要的系统。SERA 将上下文转化为清晰深思熟虑的行动，绝不违背您的意图。' },

  // Section 5.5: Demo
  'demo.badge': { en: 'PRODUCT DEMO', id: 'DEMO PRODUK', zh: '产品演示' },
  'demo.title': { en: 'See SERA in Action', id: 'Lihat SERA Beraksi', zh: '观看 SERA 演示' },
  'demo.subtitle': { en: 'Watch how SERA transforms natural language into real, verified execution.', id: 'Tonton bagaimana SERA mengubah bahasa alami menjadi eksekusi nyata yang terverifikasi.', zh: '观看 SERA 如何将自然语言转化为真实、经过验证的执行。' },
  'demo.play': { en: 'Play Demo', id: 'Putar Demo', zh: '播放演示' },

  // Idle Scene
  'idle.badge': { en: 'SAMPLE USE CASES', id: 'CONTOH PENGGUNAAN', zh: '示例用例' },
  'idle.title': { en: 'What Can You Ask SERA To Do?', id: 'Apa yang Bisa Anda Minta ke SERA?', zh: '您可以让 SERA 做什么？' },
  'idle.subtitle': { en: 'Click any sample prompt below to populate the input box and try it out!', id: 'Klik contoh prompt di bawah untuk mengisi kotak teks dan cobalah!', zh: '点击下方任意示例提示即可填充输入框并试用！' },
  'idle.cat.intro': { en: 'INTRODUCTION', id: 'PERKENALAN', zh: '介绍' },
  'idle.cat.cap': { en: 'CAPABILITIES', id: 'KEMAMPUAN', zh: '能力' },
  'idle.cat.sec': { en: 'SECURITY', id: 'KEAMANAN', zh: '安全性' },
  'idle.cat.int': { en: 'INTEGRATIONS', id: 'INTEGRASI', zh: '集成' },
  'idle.prompt1': { en: "What is SERA?", id: "Apa itu SERA?", zh: "什么是 SERA？" },
  'idle.prompt2': { en: "What can SERA help me accomplish?", id: "Apa yang bisa SERA bantu untuk saya?", zh: "SERA 能帮我完成什么？" },
  'idle.prompt3': { en: "How does SERA stay safe?", id: "Bagaimana SERA tetap aman?", zh: "SERA 如何保持安全？" },
  'idle.prompt4': { en: "What can SERA connect to?", id: "Apa saja yang bisa dihubungkan dengan SERA?", zh: "SERA 可以连接到什么？" },
  'idle.try': { en: 'Try This Prompt', id: 'Coba Prompt Ini', zh: '尝试此提示' }
};
