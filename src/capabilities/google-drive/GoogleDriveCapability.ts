import { GoogleDriveConnectionRepository } from '../../core/integrations/google-drive/GoogleDriveConnectionRepository';
import { SpreadsheetOptions, SheetDefinition, ChartDefinition } from './SpreadsheetEngine';
import { GoogleSheetsService } from './GoogleSheetsService';
import { GoogleDriveFolderService } from './services/GoogleDriveFolderService';
import { GoogleDriveFileService } from './services/GoogleDriveFileService';
import { GoogleDriveMediaService } from './services/GoogleDriveMediaService';
import { GoogleDriveSpreadsheetService } from './services/GoogleDriveSpreadsheetService';

/**
 * High-level capability facade for Google Drive integration.
 * Orchestrates folder management, file I/O, multimedia saves/CDN bridging,
 * and automated Google Sheets creation via specialized domain sub-services.
 */
export class GoogleDriveCapability {
  private readonly sheetsService: GoogleSheetsService;
  private readonly folderService: GoogleDriveFolderService;
  private readonly fileService: GoogleDriveFileService;
  private readonly mediaService: GoogleDriveMediaService;
  private readonly spreadsheetService: GoogleDriveSpreadsheetService;

  constructor(
    private readonly connections: GoogleDriveConnectionRepository,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.sheetsService = new GoogleSheetsService(this.fetchImpl);

    this.folderService = new GoogleDriveFolderService({
      connections: this.connections,
      fetchImpl: this.fetchImpl,
      getAccessToken: (userId) => this.getAccessToken(userId),
      listFiles: (userId, query) => this.fileService.listFiles(userId, query)
    });

    this.fileService = new GoogleDriveFileService({
      fetchImpl: this.fetchImpl,
      getAccessToken: (userId) => this.getAccessToken(userId),
      sheetsService: this.sheetsService,
      getVaultFolderId: (userId) => this.folderService.getVaultFolderId(userId),
      getVaultSubfolderIds: (userId, vaultFolderId) => this.folderService.getVaultSubfolderIds(userId, vaultFolderId)
    });

    this.mediaService = new GoogleDriveMediaService({
      fetchImpl: this.fetchImpl,
      getAccessToken: (userId) => this.getAccessToken(userId),
      ensureFolderPath: (userId, folderPath) => this.folderService.ensureFolderPath(userId, folderPath),
      writeBuffer: (userId, name, buffer, mimeType, targetFolderId) =>
        this.fileService.writeBuffer(userId, name, buffer, mimeType, targetFolderId),
      readBuffer: (userId, fileIdOrName) => this.fileService.readBuffer(userId, fileIdOrName),
      listFiles: (userId, query) => this.fileService.listFiles(userId, query)
    });

    this.spreadsheetService = new GoogleDriveSpreadsheetService({
      fetchImpl: this.fetchImpl,
      getAccessToken: (userId) => this.getAccessToken(userId),
      sheetsService: this.sheetsService,
      ensureFolderPath: (userId, folderPath) => this.folderService.ensureFolderPath(userId, folderPath),
      listFiles: (userId, query) => this.fileService.listFiles(userId, query),
      deleteFile: (userId, target) => this.fileService.deleteFile(userId, target),
      getPublicMediaUrl: (userId, fileId) => this.fileService.getPublicMediaUrl(userId, fileId)
    });
  }

  static fromEnvironment(connections: GoogleDriveConnectionRepository): GoogleDriveCapability | null {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return new GoogleDriveCapability(connections, clientId, clientSecret);
  }

  /** Gets a fresh access token using the stored refresh token */
  public async getAccessToken(userId: string): Promise<string> {
    const refreshToken = await this.connections.getRefreshToken(userId);
    if (!refreshToken) {
      throw new Error(`Google Drive is not connected for user ${userId}`);
    }

    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to refresh Google Drive token: ${err}`);
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }

  // ── Folder & Vault Management ──────────────────────────────────────────────
  public async getVaultSubfolderIds(userId: string, vaultFolderId: string): Promise<string[]> {
    return this.folderService.getVaultSubfolderIds(userId, vaultFolderId);
  }

  public async ensureFolder(userId: string, folderName: string, parentFolderId?: string): Promise<string> {
    return this.folderService.ensureFolder(userId, folderName, parentFolderId);
  }

  public async ensureFolderPath(userId: string, folderPath: string): Promise<string> {
    return this.folderService.ensureFolderPath(userId, folderPath);
  }

  public async createFolder(userId: string, folderName: string, parentFolderNameOrId?: string) {
    return this.folderService.createFolder(userId, folderName, parentFolderNameOrId);
  }

  public async renameItem(userId: string, targetNameOrId: string, newName: string) {
    return this.folderService.renameItem(userId, targetNameOrId, newName);
  }

  public async moveItem(userId: string, itemNameOrId: string, destinationFolderNameOrId: string) {
    return this.folderService.moveItem(userId, itemNameOrId, destinationFolderNameOrId);
  }

  public async deleteFolder(userId: string, folderNameOrId: string, permanent: boolean = false) {
    return this.folderService.deleteFolder(userId, folderNameOrId, permanent);
  }

  public async tidyVault(userId: string) {
    return this.folderService.tidyVault(userId);
  }

  // ── File I/O Operations ───────────────────────────────────────────────────
  public async listFiles(userId: string, query?: { name?: string; mimeType?: string; searchTerm?: string; folderId?: string; exact?: boolean }): Promise<any[]> {
    return this.fileService.listFiles(userId, query);
  }

  public async deleteFile(userId: string, target: { filename?: string; fileId?: string }): Promise<boolean> {
    return this.fileService.deleteFile(userId, target);
  }

  public async resolveFileId(userId: string, fileIdOrName: string): Promise<string> {
    return this.fileService.resolveFileId(userId, fileIdOrName);
  }

  public async readBuffer(userId: string, fileIdOrName: string): Promise<Buffer> {
    return this.fileService.readBuffer(userId, fileIdOrName);
  }

  public async readFile(userId: string, fileIdOrName: string): Promise<string> {
    return this.fileService.readFile(userId, fileIdOrName);
  }

  public async writeBuffer(userId: string, name: string, buffer: Buffer, mimeType: string, targetFolderId?: string): Promise<string> {
    return this.fileService.writeBuffer(userId, name, buffer, mimeType, targetFolderId);
  }

  public async writeFile(userId: string, name: string, content: string, mimeType: string = 'text/plain', targetFolderId?: string): Promise<string> {
    return this.fileService.writeFile(userId, name, content, mimeType, targetFolderId);
  }

  public async appendToFile(userId: string, name: string, contentToAppend: string): Promise<string> {
    return this.fileService.appendToFile(userId, name, contentToAppend);
  }

  public async getPublicMediaUrl(userId: string, fileId: string): Promise<string> {
    return this.fileService.getPublicMediaUrl(userId, fileId);
  }

  // ── Multimedia & CDN Bridge ───────────────────────────────────────────────
  public async saveMedia(
    userId: string,
    filename: string,
    mediaData: string | Buffer,
    mimeType?: string,
    folderName: string = '🎨 Media & Creative'
  ) {
    return this.mediaService.saveMedia(userId, filename, mediaData, mimeType, folderName);
  }

  public async bridgeDriveMediaToCdn(userId: string, filenameOrId: string) {
    return this.mediaService.bridgeDriveMediaToCdn(userId, filenameOrId);
  }

  public static sweepExpiredBridgeCache(): void {
    GoogleDriveMediaService.sweepExpiredBridgeCache();
  }

  public async cleanupCdnBridge(fileKey: string, force: boolean = false): Promise<boolean> {
    return this.mediaService.cleanupCdnBridge(fileKey, force);
  }

  // ── Spreadsheet Management ────────────────────────────────────────────────
  public async addNativeChart(
    userId: string,
    spreadsheetId: string,
    chartDef: ChartDefinition,
    numRows: number,
    headers: string[],
    rows: any[][],
    options?: SpreadsheetOptions
  ): Promise<void> {
    return this.spreadsheetService.addNativeChart(userId, spreadsheetId, chartDef, numRows, headers, rows, options);
  }

  public async createSpreadsheet(
    userId: string,
    title: string,
    headers?: string[],
    rows?: any[][],
    options?: SpreadsheetOptions,
    sheets?: SheetDefinition[]
  ): Promise<{ fileId: string; webViewLink: string; isUpdate: boolean }> {
    return this.spreadsheetService.createSpreadsheet(userId, title, headers, rows, options, sheets);
  }

  public async updateCell(
    userId: string,
    fileIdOrName: string,
    cell: string,
    value: any,
    sheetName?: string
  ): Promise<{ fileId: string; cell: string; value: any; webViewLink: string }> {
    return this.spreadsheetService.updateCell(userId, fileIdOrName, cell, value, sheetName);
  }
}
