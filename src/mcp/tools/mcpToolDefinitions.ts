/**
 * Comprehensive Tool definitions for Sera's MCP Server.
 * Exposes core Sera capabilities to Claude Desktop, Claude Web, ChatGPT, Cursor, and other LLMs.
 */
export const SERA_MCP_TOOLS = [
  {
    name: 'sera_chat',
    description: 'Send a conversational message or task instruction to your personal Sera AI agent and receive a full reasoning response. Sera can perform crypto analysis, task automation, and trigger creation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'The message or prompt to send to Sera' }
      },
      required: ['message']
    }
  },
  {
    name: 'sera_wallet_balance',
    description: 'Check the real-time balance and on-chain address of your Sera Agent Vault wallet on the Base network.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'sera_wallet_transfer',
    description: 'Create a governance proposal for a token transfer (ETH, USDC) from your Sera Agent Vault on Base. Requires dashboard approval for safety.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Recipient EVM address on Base' },
        amount: { type: 'string', description: 'Amount to transfer' },
        asset: { type: 'string', description: 'Token symbol (e.g. ETH, USDC)' },
        reason: { type: 'string', description: 'Reason for the transfer' }
      },
      required: ['to', 'amount', 'asset']
    }
  },
  {
    name: 'sera_spot_market_data',
    description: 'Query live sub-second orderbook prices, 24h change, and metrics from Hyperliquid L1 DEX for any spot token (e.g. HYPE, PURR, BTC, ETH, SOL).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        coin: { type: 'string', description: 'Token symbol (e.g. HYPE, PURR, BTC, ETH, SOL)' }
      },
      required: ['coin']
    }
  },
  {
    name: 'sera_spot_trade',
    description: 'Propose a Hyperliquid Spot market buy or sell trade from your connected agent account. Creates a governance proposal for approval.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        coin: { type: 'string', description: 'Spot token symbol (e.g. HYPE, PURR, BTC)' },
        side: { type: 'string', enum: ['buy', 'sell'], description: 'Trade side: buy or sell' },
        amount: { type: 'number', description: 'Amount in USDC or token units to trade' }
      },
      required: ['coin', 'side', 'amount']
    }
  },
  {
    name: 'sera_schedule_create',
    description: 'Create an autonomous 24/7 background scheduled task or cron job on SERA (e.g. dynamic social media posting, hourly price monitoring).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cronExpression: { type: 'string', description: 'Standard 5-part cron expression (e.g. "0 */2 * * *" for every 2 hours, "*/15 * * * *" for every 15 mins)' },
        actionIntent: { type: 'string', description: 'Target action intent (e.g. "DYNAMIC_SCHEDULED_ACTION", "CHECK_WALLET_BALANCE")' },
        taskPrompt: { type: 'string', description: 'Detailed instruction or guidelines for the autonomous agent to execute on schedule' }
      },
      required: ['cronExpression', 'actionIntent', 'taskPrompt']
    }
  },
  {
    name: 'sera_threads_publish',
    description: 'Publish a new post directly to your connected Meta Threads account via SERA.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Content of the Threads post (punchy, authentic, max 1-3 lines, no hashtags)' },
        imageUrl: { type: 'string', description: 'Optional public image URL to attach to the post' },
        driveFileName: { type: 'string', description: 'Optional exact filename of an image in your Google Drive SERA Vault to attach' }
      },
      required: ['text']
    }
  },
  {
    name: 'sera_memory_read',
    description: 'Read your Sera agent\'s confirmed long-term beliefs, facts, and working memory.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'sera_memory_write',
    description: 'Save a key preference, fact, or insight into Sera\'s persistent long-term memory so Sera remembers it in future chats.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Short descriptive key for the memory (e.g. "user_trading_style", "preferred_tokens")' },
        value: { type: 'string', description: 'The fact, insight, or preference to remember' }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'sera_billing_status',
    description: 'Check your remaining Sera Agent Credits and subscription entitlement status.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'sera_gdrive_write',
    description: 'Write or update a text document, markdown memo, or raw notes in your Google Drive SERA Vault. NOTE: To create or edit spreadsheets/tables, ALWAYS use sera_gdrive_create_sheet to preserve rich formatting, colors, and formulas.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filename: { type: 'string', description: 'Name of the document to create or update' },
        content: { type: 'string', description: 'The text content to write' },
        mimeType: { type: 'string', description: 'Optional. e.g. text/plain, text/markdown, text/csv' }
      },
      required: ['filename', 'content']
    }
  },
  {
    name: 'sera_gdrive_read',
    description: 'Read a document or spreadsheet from your Google Drive SERA Vault by file name or file ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filename: { type: 'string', description: 'Name or title of the file to read (extensions like .xlsx or .md are optional)' },
        fileId: { type: 'string', description: 'Direct file ID (if known)' }
      }
    }
  },
  {
    name: 'sera_gdrive_list',
    description: 'List or search files and spreadsheets inside your Google Drive SERA Vault folder.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Search or filter by file name/title (extensions like .xlsx or .md are optional)' },
        searchTerm: { type: 'string', description: 'Search for files containing this keyword or phrase' },
        mimeType: { type: 'string', description: 'Filter by mime type (e.g. text/markdown, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)' }
      }
    }
  },
  {
    name: 'sera_gdrive_create_sheet',
    description: 'Create OR update a professionally formatted Excel spreadsheet (.xlsx / Google Sheets) in your Google Drive SERA Vault with executive headers, zebra striping, auto-fit column widths, smart currency/percentage formatting, and live SUM formulas. If a spreadsheet with this title already exists, it updates the spreadsheet in-place preserving its file ID and styling.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Name or title of the spreadsheet' },
        sheets: {
          type: 'array',
          description: 'Optional array of worksheets for multi-tab workbooks. Each item has { name, headers, rows, options }',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Worksheet tab name' },
              headers: { type: 'array', items: { type: 'string' }, description: 'Column headers' },
              rows: { type: 'array', items: { type: 'array' }, description: 'Data rows' },
              options: { type: 'object', description: 'Sheet-specific formatting or chart options' }
            },
            required: ['name', 'headers', 'rows']
          }
        },
        headers: { type: 'array', items: { type: 'string' }, description: 'Column headers for single-sheet mode (e.g. ["Category", "Amount (IDR)", "Status"])' },
        rows: { type: 'array', items: { type: 'array' }, description: 'Data rows for single-sheet mode (array of arrays containing numbers, strings, or formulas)' },
        options: {
          type: 'object',
          description: 'Optional formatting and placement options',
          properties: {
            sheetName: { type: 'string', description: 'Name of the worksheet tab' },
            targetSheet: { type: 'string', description: 'Target sheet tab for updates or charts' },
            mode: { type: 'string', enum: ['overwrite', 'append'], description: 'Overwrite existing data or append new rows (default: overwrite)' },
            folder: { type: 'string', description: 'Target subfolder within SERA Vault (e.g. "Spreadsheets", "Reports & Research")' },
            themeColor: { type: 'string', description: 'Theme color hex without #' },
            includeSummaryRow: { type: 'boolean', description: 'Include automated TOTAL/Summary row' },
            chart: {
              type: 'object',
              description: 'Native Google Sheets chart configuration',
              properties: {
                type: { type: 'string', enum: ['COLUMN', 'BAR', 'LINE', 'PIE', 'AREA'] },
                title: { type: 'string' },
                categoryColumn: { type: 'number', description: '0-indexed column for categories/labels (0 = Column A, 1 = Column B, etc.)' },
                valueColumns: { type: 'array', items: { type: 'number' }, description: '0-indexed column(s) for series values' },
                anchorRow: { type: 'number', description: '0-indexed starting row to place chart' },
                anchorCol: { type: 'number', description: '0-indexed starting column to place chart' }
              },
              required: ['type']
            }
          }
        }
      },
      required: ['title']
    }
  },
  {
    name: 'sera_gdrive_append',
    description: 'Append new rows to an existing spreadsheet OR append notes to a text document in your Google Drive SERA Vault. For spreadsheets, pass data rows (as a CSV line or JSON array) and they will be inserted cleanly into the table without corrupting the file.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filename: { type: 'string', description: 'Name or title of the spreadsheet or document to append to' },
        content: { type: 'string', description: 'The text content or row data (CSV string or JSON array) to append' }
      },
      required: ['filename', 'content']
    }
  },
  {
    name: 'sera_gdrive_delete',
    description: 'Delete an obsolete document, draft, or spreadsheet from your Google Drive SERA Vault.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filename: { type: 'string', description: 'Name of the file to delete (e.g. "old_notes.md")' },
        fileId: { type: 'string', description: 'Direct file ID if known' }
      }
    }
  },
  {
    name: 'sera_proposal_approve',
    description: 'Approve and immediately execute a pending governance proposal (e.g. token transfer, spot trade) on-chain without switching to the web dashboard.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proposalId: { type: 'string', description: 'The proposal ID to approve (e.g. "prop-1788...")' }
      },
      required: ['proposalId']
    }
  },
  {
    name: 'sera_proposal_reject',
    description: 'Reject or cancel an active pending governance proposal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proposalId: { type: 'string', description: 'The proposal ID to reject' },
        reason: { type: 'string', description: 'Optional reason for cancellation' }
      },
      required: ['proposalId']
    }
  },
  {
    name: 'sera_proposal_list',
    description: 'List all active governance proposals currently waiting for user approval.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'sera_vault_deep_search',
    description: 'Perform an enterprise semantic RAG search across all documents, spreadsheets, PDFs, and notes in your Google Drive SERA Vault. Returns synthesised answers and source citations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The natural language search query or analytical question' },
        pageSize: { type: 'number', description: 'Maximum source documents to return (default: 5)' }
      },
      required: ['query']
    }
  }
];
