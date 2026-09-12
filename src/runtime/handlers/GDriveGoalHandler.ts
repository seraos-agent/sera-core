import { GoogleDriveCapability } from '../../capabilities/google-drive/GoogleDriveCapability';
import { SpreadsheetEngine } from '../../capabilities/google-drive/SpreadsheetEngine';
import { GoogleSheetsFormatter } from '../../capabilities/google-drive/spreadsheet/GoogleSheetsFormatter';
import { EmitResultFn } from './types';

/**
 * GDriveGoalHandler — Manages all execution operations for Google Drive and Google Spreadsheets.
 *
 * Responsibilities:
 * - File operations: write, append, read, delete, save media
 * - Folder operations: create folder, rename, move, delete folder, tidy vault
 * - Spreadsheet operations: create spreadsheet with multi-tab support and formatting, update cell
 */
export class GDriveGoalHandler {
  constructor(
    private readonly getGoogleDriveCapability: () => GoogleDriveCapability,
    private readonly sessionId: string,
    private readonly emitResult: EmitResultFn
  ) {}

  private get googleDriveCapability(): GoogleDriveCapability {
    return this.getGoogleDriveCapability();
  }

  public async handleWrite(requestId: string, payload: any): Promise<void> {
    try {
      const { filename, content, mimeType } = payload;
      const fileId = await this.googleDriveCapability.writeFile(this.sessionId, filename, content, mimeType);
      this.emitResult(requestId, true, { fileId, filename });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleAppend(requestId: string, payload: any): Promise<void> {
    try {
      const { filename, content } = payload;
      if (!filename || content === undefined) throw new Error('GDrive append requires filename and content.');
      const fileId = await this.googleDriveCapability.appendToFile(this.sessionId, filename, content);
      this.emitResult(requestId, true, { fileId, filename });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleRead(requestId: string, payload: any): Promise<void> {
    try {
      const filename = payload?.filename || payload?.fileName || payload?.name || payload?.title;
      const target = payload?.fileId || payload?.id || filename;
      if (!target) throw new Error('Must provide either filename or fileId to read a file.');

      const resolvedId = await this.googleDriveCapability.resolveFileId(this.sessionId, target);
      const content = await this.googleDriveCapability.readFile(this.sessionId, resolvedId);
      this.emitResult(requestId, true, { content, fileId: resolvedId });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleCreateSheet(requestId: string, payload: any): Promise<void> {
    try {
      const { title, headers, rows, options, sheets, mode, folder, sheetName } = payload;
      const effectiveOptions = {
        ...options,
        mode: mode || options?.mode,
        folder: folder || options?.folder,
        sheetName: sheetName || options?.sheetName
      };

      // Early normalization of headers & rows to guarantee 2D arrays even if LLM sent stringified JSON or objects
      const normalizedInput = GoogleSheetsFormatter.normalizeSpreadsheetInput(headers, rows);
      let effectiveHeaders = normalizedInput.headers;
      let effectiveRows = normalizedInput.rows;

      let normalizedSheets = sheets;
      if (Array.isArray(sheets) && sheets.length > 0) {
        normalizedSheets = sheets.map((s: any) => {
          const sNorm = GoogleSheetsFormatter.normalizeSpreadsheetInput(s.headers, s.rows);
          return {
            ...s,
            headers: sNorm.headers,
            rows: sNorm.rows
          };
        });
        if (effectiveHeaders.length === 0 && normalizedSheets[0]?.headers) {
          effectiveHeaders = normalizedSheets[0].headers;
        }
        if (effectiveRows.length === 0 && normalizedSheets[0]?.rows) {
          effectiveRows = normalizedSheets[0].rows;
        }
      }

      const hasAnyRows = effectiveRows.length > 0 || (normalizedSheets && normalizedSheets.some((s: any) => s.rows && s.rows.length > 0));
      if (!hasAnyRows && !effectiveOptions?.allowEmpty) {
        throw new Error(`Cannot create spreadsheet "${title}" with 0 data rows. All provided rows were empty or invalid. Please provide valid data rows in the "rows" parameter.`);
      }

      const result = await this.googleDriveCapability.createSpreadsheet(
        this.sessionId,
        title,
        effectiveHeaders,
        effectiveRows,
        effectiveOptions,
        normalizedSheets
      );

      const summaryMetrics = SpreadsheetEngine.calculateSummaryMetrics(effectiveHeaders, effectiveRows, effectiveOptions);

      const sheetNames = normalizedSheets && normalizedSheets.length > 0
        ? normalizedSheets.map((s: any) => s.name)
        : [effectiveOptions.sheetName || 'Sheet1'];

      this.emitResult(requestId, true, {
        fileId: result.fileId,
        webViewLink: result.webViewLink,
        title,
        isUpdate: result.isUpdate,
        sheetNames,
        renderedRows: summaryMetrics.renderedRows,
        calculatedSummary: summaryMetrics.totals,
        summary: `Spreadsheet "${title}" ${result.isUpdate ? 'updated in-place' : 'created'} with tabs [${sheetNames.join(', ')}] and ${summaryMetrics.renderedRows} data rows.`,
        _systemMessage: `File "${title}" ${result.isUpdate ? 'successfully updated in-place' : 'successfully generated'} with tabs [${sheetNames.join(', ')}] and ${summaryMetrics.renderedRows} data rows. View link: ${result.webViewLink}. Rendered totals: ${JSON.stringify(summaryMetrics.totals)}.`
      });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleUpdateCell(requestId: string, payload: any): Promise<void> {
    try {
      const { title, cell, value, sheetName, fileId } = payload || {};
      const target = title || fileId;
      if (!target) throw new Error('Must provide spreadsheet title or fileId to update a cell.');
      if (!cell) throw new Error('Must provide cell address (e.g. "B5").');
      if (value === undefined) throw new Error('Must provide a new value for the cell.');

      const result = await this.googleDriveCapability.updateCell(
        this.sessionId,
        target,
        cell,
        value,
        sheetName
      );

      this.emitResult(requestId, true, {
        fileId: result.fileId,
        cell: result.cell,
        value: result.value,
        webViewLink: result.webViewLink,
        summary: `Cell ${cell} in spreadsheet "${target}" updated to: ${value}`,
        _systemMessage: `Cell ${cell} in spreadsheet "${target}" successfully updated to: ${value}. View link: ${result.webViewLink}`
      });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleList(requestId: string, payload: any): Promise<void> {
    try {
      const { name, searchTerm, mimeType } = payload || {};
      const files = await this.googleDriveCapability.listFiles(this.sessionId, { name, searchTerm, mimeType });
      this.emitResult(requestId, true, { files, count: files.length });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleDelete(requestId: string, payload: any): Promise<void> {
    try {
      const filename = payload?.filename || payload?.fileName || payload?.name || payload?.title;
      const fileId = payload?.fileId || payload?.id;
      await this.googleDriveCapability.deleteFile(this.sessionId, { filename, fileId });
      this.emitResult(requestId, true, { deleted: true, filename: filename || fileId });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleSaveMedia(requestId: string, payload: any): Promise<void> {
    try {
      const filename = payload?.filename || payload?.name || payload?.title;
      const mediaUrl = payload?.mediaUrl || payload?.url || payload?.dataUrl;
      const folder = payload?.folder || '🎨 Media & Creative';
      const mimeType = payload?.mimeType;

      if (!filename) throw new Error('Saving media to Google Drive requires a filename.');
      if (!mediaUrl) throw new Error('Saving media to Google Drive requires attached media or a mediaUrl.');

      const result = await this.googleDriveCapability.saveMedia(
        this.sessionId,
        filename,
        mediaUrl,
        mimeType,
        folder
      );

      this.emitResult(requestId, true, {
        fileId: result.fileId,
        filename: result.filename,
        webViewLink: result.webViewLink,
        folder: result.folder,
        isVideo: result.isVideo,
        summary: `Media file "${result.filename}" successfully saved to Google Drive in folder "${result.folder}".`,
        _userMessage: `Foto/video "${result.filename}" berhasil disimpan ke Google Drive di folder ${result.folder}. Link: ${result.webViewLink}`
      });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleCreateFolder(requestId: string, payload: any): Promise<void> {
    try {
      const folderName = payload?.folderName || payload?.name || payload?.title;
      const parentFolder = payload?.parentFolder || payload?.parent;
      if (!folderName) throw new Error('Folder name is required to create a folder.');

      const result = await this.googleDriveCapability.createFolder(this.sessionId, folderName, parentFolder);
      this.emitResult(requestId, true, {
        folderId: result.folderId,
        folderName: result.folderName,
        webViewLink: result.webViewLink,
        summary: `Folder "${result.folderName}" successfully created in Google Drive SERA Vault.`,
        _userMessage: `Folder "${result.folderName}" berhasil dibuat di Google Drive SERA Vault. Link: ${result.webViewLink}`
      });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleRename(requestId: string, payload: any): Promise<void> {
    try {
      const targetName = payload?.targetName || payload?.name || payload?.oldName || payload?.filename || payload?.fileId;
      const newName = payload?.newName || payload?.title;
      if (!targetName) throw new Error('Target item name or ID is required for rename.');
      if (!newName) throw new Error('New name is required for rename.');

      const result = await this.googleDriveCapability.renameItem(this.sessionId, targetName, newName);
      this.emitResult(requestId, true, {
        id: result.id,
        oldName: result.oldName,
        newName: result.newName,
        isFolder: result.isFolder,
        summary: `${result.isFolder ? 'Folder' : 'File'} "${result.oldName}" successfully renamed to "${result.newName}".`,
        _userMessage: `${result.isFolder ? 'Folder' : 'File'} "${result.oldName}" berhasil diubah namanya menjadi "${result.newName}".`
      });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleMove(requestId: string, payload: any): Promise<void> {
    try {
      const filename = payload?.filename || payload?.targetFile || payload?.name || payload?.fileId;
      const targetFolder = payload?.targetFolder || payload?.destinationFolder || payload?.folder;
      if (!filename) throw new Error('Filename or ID is required to move a file.');
      if (!targetFolder) throw new Error('Destination folder is required to move a file.');

      const result = await this.googleDriveCapability.moveItem(this.sessionId, filename, targetFolder);
      this.emitResult(requestId, true, {
        id: result.id,
        name: result.name,
        destinationFolder: result.destinationFolder,
        webViewLink: result.webViewLink,
        summary: `File "${result.name}" successfully moved to folder "${result.destinationFolder}".`,
        _userMessage: `File "${result.name}" berhasil dipindahkan ke folder "${result.destinationFolder}".`
      });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleDeleteFolder(requestId: string, payload: any): Promise<void> {
    try {
      const folderName = payload?.folderName || payload?.name || payload?.folderId || payload?.id;
      if (!folderName) throw new Error('Folder name or ID is required to delete a folder.');

      const result = await this.googleDriveCapability.deleteFolder(this.sessionId, folderName, false);
      this.emitResult(requestId, true, {
        id: result.id,
        name: result.name,
        trashed: result.trashed,
        summary: `Folder "${result.name}" successfully moved to Google Drive Trash.`,
        _userMessage: `Folder "${result.name}" berhasil dipindahkan ke Sampah (Trash) Google Drive.`
      });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  public async handleTidyVault(requestId: string, payload?: any): Promise<void> {
    try {
      const result = await this.googleDriveCapability.tidyVault(this.sessionId);
      const summaryMsg = result.movedCount > 0
        ? `Organized ${result.movedCount} file(s) into their appropriate subfolders.`
        : 'All files in your SERA Vault are already neatly organized in their subfolders.';
      const userMsg = result.movedCount > 0
        ? `Beres! Sebanyak ${result.movedCount} file yang tercecer di Google Drive berhasil dirapikan ke subfolder masing-masing:\n` +
          result.items.map(item => `• ${item.name} ➔ ${item.destinationFolder}`).join('\n')
        : 'Google Drive SERA Vault Anda sudah rapi! Semua file sudah berada di subfoldernya masing-masing.';

      this.emitResult(requestId, true, {
        movedCount: result.movedCount,
        items: result.items,
        summary: summaryMsg,
        _userMessage: userMsg
      });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }
}
