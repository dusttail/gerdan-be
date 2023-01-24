import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { cwd } from 'process';
import { sleep } from 'src/utils/sleep';

@Injectable()
export class FileStorageService {
    public prepareFilePath(fileName: string, extension = 'txt'): string {
        return join(cwd(), 'temp', `${fileName}-${randomUUID()}.${extension}`);
    }

    public async extractFile(path: string): Promise<Buffer> {
        const ONE_MINUTE_IN_MILLISECONDS = 60000;
        const SLEEP_TIME = 100;
        const maxAttempts = ONE_MINUTE_IN_MILLISECONDS / SLEEP_TIME;
        let file: Buffer;

        for (let attempts = 0; attempts < maxAttempts; attempts++) {
            if (!existsSync(path)) { await sleep(SLEEP_TIME); continue; }
            file = await readFile(path);
            break;
        }

        await unlink(path);
        return file;
    }

    public async saveFile(path: string, buffer: Buffer) {
        await writeFile(path, buffer);
    }
}
