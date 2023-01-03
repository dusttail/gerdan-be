import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { cwd } from 'process';

type extensions = 'pdf' | 'png';

@Injectable()
export class FileStorageService {
    getFilePath(userId: ID, filename: string, extension: extensions): string {
        return join(cwd(), 'database', 'files', `user_id_${userId}`, extension, `user_id_${userId}_${filename}.${extension}`);

    }

    readFile(userId: ID, filename: string, extension: extensions): Buffer {
        return readFileSync(this.getFilePath(userId, filename, extension));
    }
}
