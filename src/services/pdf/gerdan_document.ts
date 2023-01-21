import { randomUUID } from 'crypto';
import { createWriteStream, existsSync, unlinkSync } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import * as PDFDocument from 'pdfkit';
import { cwd } from 'process';
import { Gerdan } from 'src/database/models/gerdan.model';
import { User } from 'src/database/models/user.model';
import { sleep } from 'src/utils/sleep';

type NewDocumentMetaData = {
    Title: string;
    Author: string;
};

type PDFPixel = {
    color: string;
    index: number;
    indexColor: string;
};
type PixelsGrid = PDFPixel[][];

type ColorStatics = { color: string, count: number; }[];

type Statistics = {
    rows: number,
    columns: number,
    colors: ColorStatics;
};

export class GerdanDocument {
    private readonly BLACK = '#000000' as const;
    private readonly WHITE = '#FFFFFF' as const;
    private readonly EMPTY_INDEX = ' ' as const;
    private readonly charactersSet = [
        'Ø', '1', '2', '3', '4',
        '5', '6', '7', '8', '9',
        'A', 'B', 'C', 'D', 'E',
        'F', 'G', 'H', 'J', 'K',
        'L', 'M', 'N', 'O', 'P',
        'R', 'S', 'T', 'U', 'V',
        'W', 'X', 'Y', 'Z'] as const;
    private readonly docSize = {
        width: 595.28,
        height: 841.89,
        marginLeft: 60,
        marginTop: 58,
        marginRight: 55.28,
        marginBottom: 57.98
    } as const;
    private readonly printSize = {
        width: this.docSize.width - this.docSize.marginLeft - this.docSize.marginRight,
        height: this.docSize.height - this.docSize.marginTop - this.docSize.marginBottom,
    } as const;
    private filePath: string;
    private doc: typeof PDFDocument;
    private backgroundColor: string;
    private pixelSize: number;
    private indexSize: number;
    private height: number;
    private width: number;
    constructor(gerdan: Gerdan, user: User) {
        this.filePath = join(cwd(), 'temp', `${user.username}-${gerdan.name}-${randomUUID()}.pdf`);
        this.backgroundColor = gerdan.backgroundColor || this.WHITE;
        this.height = gerdan.height;
        this.width = gerdan.width;
        this.pixelSize = this.calculatePixelsSize(gerdan);
        this.indexSize = this.calculateIndexesSize(this.pixelSize);
        const pixelsGrid = this.mapPixels(gerdan);
        const statistics = this.collectStatistic(pixelsGrid);

        try {
            this.createDocument({ Title: gerdan.name, Author: user.username });
            this.addInfoPage(user, gerdan);
            this.drawStatistics(statistics);
            this.drawPixelsGrid(pixelsGrid);
            this.closeDocument();
        } catch (error) {
            this.closeDocument();
            unlinkSync(this.filePath);
            throw error;
        }
    }

    private drawStatistics(statistics: Statistics) {
        const textPositionX = this.docSize.width - this.docSize.marginLeft - 100;
        let textPositionY = 400;
        const textSize = 14;
        const space = 18;
        this.doc
            .fontSize(textSize);
        textPositionY += space;
        this.doc.text(`Rows: ${statistics.rows}`, textPositionX, textPositionY);
        textPositionY += space;
        this.doc.text(`Columns: ${statistics.columns}`, textPositionX, textPositionY);

        for (const [key, value] of Object.entries(statistics.colors)) {
            textPositionY += space;
            this.doc.text(`${this.charactersSet[key]} - ${value.color} - ${value.count}`, textPositionX, textPositionY);
            this.drawPixel(
                textPositionX - this.pixelSize,
                textPositionY - (space - textSize) / 2,
                value.color,
                textSize
            );
        }
    }

    private collectStatistic(pixelsGrid: PixelsGrid): Statistics {
        const statistics = {
            rows: this.height,
            columns: this.width,
            colors: []
        };

        for (let y = 0; y < this.height; y++) {
            let pixelsInARow = 0;
            for (let x = 0; x < this.width; x++) {
                if (!pixelsGrid[y][x].index) continue;
                if (!statistics.colors[pixelsGrid[y][x].index])
                    statistics.colors[pixelsGrid[y][x].index] = { color: pixelsGrid[y][x].color, count: 0 };
                statistics.colors[pixelsGrid[y][x].index].count++;
                pixelsInARow++;
            }
            statistics.rows++;
            if (statistics.columns < pixelsInARow) statistics.columns = pixelsInARow;
        }

        return statistics;
    }

    private drawPixelsGrid(pixelsGrid: PixelsGrid) {
        const pixelsPerPage = ~~(this.printSize.height / this.pixelSize);
        const totalPages = Math.floor(this.height / pixelsPerPage);
        let page = -1;
        for (let y = 0; y < this.height; y++) {
            if (!(y % pixelsPerPage)) {
                page++;
                this.doc
                    .addPage()
                    .fontSize(this.indexSize);
                this.addPageNumber(page, totalPages);
                this.addSiteMark();
            }
            for (let x = 0; x < this.width; x++) {
                const color = pixelsGrid[y][x].color;
                this.drawPixel(
                    this.pixelPositionX(x),
                    this.pixelPositionY(y - pixelsPerPage * page),
                    color
                );
                if (color !== this.backgroundColor)
                    this.writeIndex(
                        this.indexPosition(this.pixelPositionX(x)),
                        this.indexPosition(this.pixelPositionY(y - pixelsPerPage * page)),
                        pixelsGrid[y][x].index,
                        pixelsGrid[y][x].indexColor
                    );
            }
        }
    }

    private addPageNumber(currentPage: number, totalPages: number) {
        this.doc
            .fontSize(14)
            .fillColor(this.BLACK)
            .text(`${currentPage + 1} / ${totalPages + 1}`,
                500,
                800
            );
    }

    private drawPixel(x: number, y: number, color: string, size = this.pixelSize) {
        this.doc
            .rect(x, y, size, size)
            .fillAndStroke(color, this.BLACK);
    }

    private writeIndex(x: number, y: number, index: number, color: string) {
        this.doc
            .fillColor(color ?? this.BLACK)
            .text(
                index ? this.charactersSet[index] : this.EMPTY_INDEX,
                this.indexPosition(x),
                this.indexPosition(y),
                {
                    lineBreak: false,
                });
    }

    private indexPosition(pos: number): number {
        return pos + this.pixelSize / 7;
    }

    private pixelPositionX(x: number): number {
        return x * this.pixelSize + this.docSize.marginLeft;
    }

    private pixelPositionY(y: number): number {
        return y * this.pixelSize + this.docSize.marginTop;
    }

    private mapPixels(gerdan: Gerdan): PixelsGrid {
        const grid = [];
        for (let y = 0; y < gerdan.height; y++) {
            if (!grid[y]) grid[y] = [];
            for (let x = 0; x < gerdan.width; x++) {
                grid[y][x] = {
                    color: this.backgroundColor,
                    index: 0,
                    indexColor: this.WHITE,
                };
            }
        }

        for (const pixel of gerdan.pixels) {
            grid[pixel.y / gerdan.pixelSize][pixel.x / gerdan.pixelSize] = {
                color: pixel.color,
                index: pixel.index,
                indexColor: pixel.indexColor,
            };
        }

        return grid;
    }

    public async getFile(): Promise<Buffer> {
        const ONE_MINUTE_IN_MILLISECONDS = 60000;
        const SLEEP_TIME = 100;
        const maxAttempts = ONE_MINUTE_IN_MILLISECONDS / SLEEP_TIME;
        let file: Buffer;

        for (let attempts = 0; attempts < maxAttempts; attempts++) {
            if (!existsSync(this.filePath)) { await sleep(SLEEP_TIME); continue; }
            file = await readFile(this.filePath);
            break;
        }

        await unlink(this.filePath);
        return file;
    }

    private closeDocument() {
        this.doc.end();
    }

    private addSiteMark() {
        const siteMark = process.env.SITE_MARK as string;
        const markWidth = this.doc
            .fontSize(14)
            .widthOfString(siteMark);

        this.doc
            .fontSize(14)
            .fillColor(this.BLACK)
            .text('Gerdan.js',
                this.docSize.width / 2 - markWidth / 2,
                800
            );
    }

    private addInfoPage(user: User, gerdan: Gerdan) {
        this.doc
            .addPage()
            .fontSize(60)
            .text(gerdan.name, this.docSize.marginRight, 200)
            .fontSize(42)
            .text(`by @${user.username}`)
            .text('generated on Gerdan.js');

        this.addSiteMark();
    }

    private createDocument(metadata: NewDocumentMetaData) {
        this.doc = new PDFDocument({
            size: 'A4',
            autoFirstPage: false,
            margin: 0,
            layout: 'portrait',
            info: {
                Title: metadata.Title,
                Author: metadata.Author
            },
            pdfVersion: '1.7'
        });

        this.doc.pipe(createWriteStream(this.filePath));
    }

    private calculateIndexesSize(pixelSize: number) {
        return pixelSize * .8;
    }

    private calculatePixelsSize(gerdan: Gerdan): number {
        return ~~(this.printSize.width / gerdan.width);
    }
}
