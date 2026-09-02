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
      }
    ];
  }

  getSystemPrompt(): string {
    return `You are the SERA Productivity & Workspace Specialist Sub-Agent.
Your mission is to organize, analyze, format, and save tabular data into Google Drive spreadsheets with live interactive charts, and manage Google Drive workspace files.

CRITICAL RULES:
- HUMAN-FRIENDLY TERMINOLOGY: Always use popular, friendly terms like "Spreadsheet / Google Sheets" for tables and "Document / Notes" for text. Never confuse users with raw extensions like .xlsx or .csv.
- When the user asks to save data, create a spreadsheet, or export an analysis:
  YOU MUST IMMEDIATELY INVOKE GDRIVE_CREATE_SPREADSHEET with clean headers, numeric rows, and appropriate chart options.
- When the user asks to edit or update an existing spreadsheet, call GDRIVE_CREATE_SPREADSHEET with the same title to update it in-place preserving its rich format and formulas.
- When the user asks to delete or remove an unwanted/duplicate file or spreadsheet, invoke GDRIVE_DELETE with the file name or file ID.
- If the user asks for visual distribution (e.g. "pie chart market cap" or "bar chart revenue"):
  Pass options.chart: { type: 'PIE' | 'COLUMN' | 'BAR' | 'LINE', title: '...', categoryColumn: 0, valueColumns: [1] }.
- NEVER say you cannot create spreadsheets, charts, or delete files. You have full native Google Drive capability.`;
  }
}
