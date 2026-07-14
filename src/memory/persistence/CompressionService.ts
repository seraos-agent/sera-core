import * as zlib from 'node:zlib';
import { promisify } from 'node:util';

const brotliCompress = promisify(zlib.brotliCompress);
const brotliDecompress = promisify(zlib.brotliDecompress);

export class CompressionService {
  /**
   * Compresses a string payload into a Buffer using Brotli.
   */
  public async compress(payload: string): Promise<Buffer> {
    return brotliCompress(payload);
  }

  /**
   * Decompresses a Buffer into the original string using Brotli.
   */
  public async decompress(compressedPayload: Buffer): Promise<string> {
    const decompressed = await brotliDecompress(compressedPayload);
    return decompressed.toString('utf-8');
  }
}
