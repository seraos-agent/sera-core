import { ISubAgent, SubAgentDomain } from './types';
import { SeraTool } from '../../core/cognitive/Tool';

export class ProductivitySubAgent implements ISubAgent {
  readonly domain: SubAgentDomain = 'productivity';
  readonly name = 'SERA Productivity & Workspace Specialist';
  readonly description = 'Specialized in Google Drive, Excel spreadsheets (.xlsx), ingested document analysis, and native Google Sheets charts.';

  getTools(): SeraTool[] {
    return [
      {
        name: 'GDRIVE_CREATE_SPREADSHEET',
        description: 'Creates OR updates a professionally formatted Excel spreadsheet (.xlsx / Google Sheets) in Google Drive with headers, zebra striping, currency/percent formats, and optional native charts (COLUMN, BAR, LINE, PIE, AREA). If a spreadsheet with the title already exists, it updates it in-place.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Name or title of the spreadsheet' },
            headers: { type: 'array', items: { type: 'string' }, description: 'Column headers (e.g. ["Category", "Amount", "Status"])' },
            rows: { type: 'array', items: { type: 'array' }, description: 'Data rows (array of arrays containing numbers, strings, or formulas)' },
            options: {
              type: 'object',
              description: 'Optional formatting options (sheetName, themeColor, chart)',
              properties: {
                sheetName: { type: 'string' },
                themeColor: { type: 'string' },
                includeSummaryRow: { type: 'boolean' },
                chart: {
                  type: 'object',
                  description: 'Native Google Sheets interactive chart configuration',
                  properties: {
                    type: { type: 'string', enum: ['COLUMN', 'BAR', 'LINE', 'PIE', 'AREA'], description: 'Chart visualization type' },
                    title: { type: 'string', description: 'Title displayed above the chart' },
                    categoryColumn: { type: 'number', description: '0-indexed column number containing category labels (e.g. 0 for Coin name)' },
                    valueColumns: { type: 'array', items: { type: 'number' }, description: '0-indexed column number(s) containing numeric data series (e.g. [2] for Market Cap)' }
                  },
                  required: ['type']
                }
              }
            }
          },
          required: ['title', 'headers', 'rows']
        }
      },
      {
        name: 'GDRIVE_UPDATE_CELL',
        description: 'Updates a specific cell or small range in an existing Google Sheets spreadsheet without rebuilding the entire file.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Name or title of the spreadsheet (or file ID)' },
            cell: { type: 'string', description: 'Cell address (e.g. "B5", "C10")' },
            value: { description: 'New value (number, string, or formula starting with =)' },
            sheetName: { type: 'string', description: 'Optional tab name (defaults to first sheet)' }
          },
          required: ['title', 'cell', 'value']
        }
      },
      {
        name: 'GDRIVE_LIST',
        description: 'Lists or searches recent spreadsheets and documents in your Google Drive SERA Vault.',
        parameters: {
          type: 'object',
          properties: {
            searchTerm: { type: 'string', description: 'Optional keyword or title to search by' }
          }
        }
      },
      {
        name: 'GDRIVE_READ',
        description: 'Reads the text or tabular content of a document or spreadsheet from Google Drive by file ID or file title.',
        parameters: {
          type: 'object',
          properties: {
            fileId: { type: 'string', description: 'Google Drive file ID (or filename)' }
          },
          required: ['fileId']
        }
      },
      {
        name: 'GDRIVE_DELETE',
        description: 'Moves an unwanted, duplicate, or obsolete document or spreadsheet to Google Drive Trash by file name or file ID.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name or title of the file to delete (e.g. "Contoh Data SPK")' },
            fileId: { type: 'string', description: 'Optional direct Google Drive file ID' }
          }
        }
      },
      {
        name: 'GDRIVE_SAVE_MEDIA',
        description: 'Saves an attached photo or video from the current chat (or a media URL) directly into the user Google Drive SERA Vault inside "🎨 Media & Creative".',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name of the file to save (e.g. "promo-launch.jpg" or "product-video.mp4")' },
            mediaUrl: { type: 'string', description: 'Optional media URL. If omitted, automatically uses the photo or video attached in the current chat message.' },
            folder: { type: 'string', description: 'Optional subfolder name. Defaults to "🎨 Media & Creative".' }
          },
          required: ['filename']
        }
      },
      {
        name: 'GDRIVE_CREATE_FOLDER',
        description: 'Creates a new folder inside Google Drive SERA Vault (or nested inside another folder).',
        parameters: {
          type: 'object',
          properties: {
            folderName: { type: 'string', description: 'Name of the folder to create (e.g. "Katalog Promo 2026")' },
            parentFolder: { type: 'string', description: 'Optional parent folder path or name. Defaults to SERA Vault root.' }
          },
          required: ['folderName']
        }
      },
      {
        name: 'GDRIVE_RENAME',
        description: 'Renames an existing file or folder in Google Drive SERA Vault.',
        parameters: {
          type: 'object',
          properties: {
            targetName: { type: 'string', description: 'Current name or file/folder ID of the item to rename' },
            newName: { type: 'string', description: 'The new name for the file or folder' }
          },
          required: ['targetName', 'newName']
        }
      },
      {
        name: 'GDRIVE_MOVE',
        description: 'Moves a file to a designated target folder in Google Drive SERA Vault.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Filename or file ID to move' },
            targetFolder: { type: 'string', description: 'Destination folder name or path (e.g. "🎨 Media & Creative", "Katalog Promo", or "root")' }
          },
          required: ['filename', 'targetFolder']
        }
      },
      {
        name: 'GDRIVE_DELETE_FOLDER',
        description: 'Safely removes or trashes an unwanted folder from Google Drive SERA Vault.',
        parameters: {
          type: 'object',
          properties: {
            folderName: { type: 'string', description: 'Name or ID of the folder to delete' }
          },
          required: ['folderName']
        }
      },
      {
        name: 'GDRIVE_TIDY_VAULT',
        description: 'Automatically scans uncategorized files sitting at the root of Google Drive SERA Vault and moves them into their appropriate subfolders (Media to "🎨 Media & Creative", Spreadsheets to "📊 Spreadsheets & Analysis", Documents to "📑 Reports & Research").',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  getSystemPrompt(): string {
    return `You are the SERA Productivity & Workspace Specialist Sub-Agent.
Your mission is to organize, analyze, format, and save tabular data into Google Drive spreadsheets with live interactive charts, and manage Google Drive workspace files and folders.

CRITICAL RULES:
- HUMAN-FRIENDLY TERMINOLOGY: Always use popular, friendly terms like "Spreadsheet / Google Sheets" for tables and "Document / Notes" for text. Never confuse users with raw extensions like .xlsx or .csv.
- When the user asks to save data, create a spreadsheet, or export an analysis:
  YOU MUST IMMEDIATELY INVOKE GDRIVE_CREATE_SPREADSHEET with clean headers, numeric rows, and appropriate chart options.
- When the user asks to edit or update an existing spreadsheet, call GDRIVE_CREATE_SPREADSHEET with the same title to update it in-place preserving its rich format and formulas.
- When the user asks to change or update a single cell value or formula (e.g. "ubah sel B5 jadi 250000" or "set cell C2 =ROW()-1"), invoke GDRIVE_UPDATE_CELL.
- When the user sends a photo or video in chat and asks to save it to Google Drive (or "simpan foto/video"), invoke GDRIVE_SAVE_MEDIA with a clean, descriptive filename.
- When the user asks to create a folder (e.g. "buat folder baru", "bikin folder"), invoke GDRIVE_CREATE_FOLDER.
- When the user asks to rename a file or folder (e.g. "ganti nama folder", "rename file"), invoke GDRIVE_RENAME.
- When the user asks to move a file into a folder (e.g. "pindahkan file ini ke folder itu"), invoke GDRIVE_MOVE.
- When the user asks to delete a folder (e.g. "hapus folder"), invoke GDRIVE_DELETE_FOLDER.
- When the user asks to tidy up, organize, or clean their Google Drive (e.g. "rapikan google drive", "rapikan file", "tidy vault"), invoke GDRIVE_TIDY_VAULT.
- When the user asks to delete or remove an unwanted/duplicate file or spreadsheet, invoke GDRIVE_DELETE with the file name or file ID.
- If the user asks for visual distribution (e.g. "pie chart market cap" or "bar chart revenue"):
  Pass options.chart: { type: 'PIE' | 'COLUMN' | 'BAR' | 'LINE', title: '...', categoryColumn: 0, valueColumns: [1] }.
- NEVER say you cannot create spreadsheets, charts, save media, or manage folders. You have full native Google Drive capability.`;
  }
}
