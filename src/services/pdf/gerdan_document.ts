import { createWriteStream, existsSync } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import * as PDFDocument from 'pdfkit';
import { cwd } from 'process';
import { Gerdan } from 'src/database/models/gerdan.model';
import { Pixel } from 'src/database/models/pixel.model';
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
type Grid = Map<number, Map<number, PDFPixel>>;

type ColorStatics = { color: string, count: number; }[];

type Statistics = {
    rows: number,
    columns: number,
    colors: ColorStatics;
};

export class GerdanDocument {
    private readonly BLACK = '#000000';
    private readonly WHITE = '#FFFFFF';
    private readonly EMPTY = ' ';
    private readonly charactersSet = [
        'Ø', '1', '2', '3', '4',
        '5', '6', '7', '8', '9',
        'A', 'B', 'C', 'D', 'E',
        'F', 'G', 'H', 'J', 'K',
        'L', 'M', 'N', 'O', 'P',
        'R', 'S', 'T', 'U', 'V',
        'W', 'X', 'Y', 'Z'];
    private readonly docSize = {
        width: 595.28,
        height: 841.89,
        marginLeft: 60,
        marginTop: 58,
        marginRight: 55.28,
        marginBottom: 57.98
    };
    private filePath = '';
    private doc: typeof PDFDocument;
    private pixelSize = 9;
    private denominator = 1;
    private readonly grid: Grid;
    private readonly statistics: Statistics;
    constructor(gerdan: Gerdan, user: User) {
        this.filePath = join(cwd(), 'temp', `${user.username}-${gerdan.name}.pdf`);
        this.denominator = this.calculateDenominator(gerdan.width);
        this.pixelSize = this.calculatePixelSize(gerdan.width);
        this.grid = this.createGridMapFromPixels(gerdan.pixels);

        // this.statistics = this.collectStatistic(this.grid);

        this.createDocument({ Title: gerdan.name, Author: user.username });
        this.addInfoPage(user, gerdan);
        this.drawGrid(this.grid);
        this.closeDocument();
    }

    public getFilePath(): string {
        return this.filePath;
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

    private createGridMapFromPixels(pixels: Pixel[]): Grid {
        const grid: Grid = new Map();
        for (const pixel of pixels) {
            const x = pixel.x / this.denominator;
            const y = pixel.y / this.denominator;
            if (!grid.has(y)) grid.set(y, new Map());

            const data = {
                color: pixel.color,
                index: pixel.index,
                indexColor: pixel.indexColor,
            };

            grid.get(y).set(x, data);
        }
        return grid;
    }

    // private collectStatistic(grid: Grid): Statistics {
    //     const statistics = {
    //         rows: 0,
    //         columns: 0,
    //         colors: []
    //     };

    //     for (const line of grid) {
    //         let pixelsInARow = 0;
    //         for (const pixel of line) {
    //             if (!pixel?.index) break;
    //             if (!statistics.colors[pixel.index]) statistics.colors[pixel.index] = { color: pixel.color, count: 1 };
    //             statistics.colors[pixel.index].count++;
    //             pixelsInARow++;
    //         }
    //         statistics.rows++;
    //         if (statistics.columns < pixelsInARow) statistics.columns = pixelsInARow;
    //     }

    //     return statistics;
    // }

    private addInfoPage(user: User, gerdan: Gerdan) {
        this.doc
            .addPage()
            .fontSize(60)
            .text(gerdan.name, this.docSize.marginRight, 200)
            .fontSize(42)
            .text(`by @${user.username}`)
            .text('generated on Gerdan.js');

        // this.drawStatistics();

        this.addSiteMark();
    }

    private drawStatistics() {
        const textPositionX = this.docSize.width - this.docSize.marginLeft - 100;
        const textPositionY = 400;
        this.doc
            .fontSize(14)
            .text(`Rows: ${this.statistics.rows}`, textPositionX, textPositionY)
            .text(`Columns: ${this.statistics.columns}`, textPositionX, textPositionY + 100);

        for (const [key, value] of Object.entries(this.statistics.colors)) {
            this.doc.text(`${this.charactersSet[key]} - ${value.color} - ${value.count}`);
        }
    }

    private drawGrid(grid: Grid) {
        const gridLines = grid.size;
        const maxPageHeight = ~~((this.docSize.height - this.docSize.marginTop - this.docSize.marginBottom) / this.pixelSize);
        const pages = ~~(gridLines / maxPageHeight) + 1;
        let pageNumber = 1;

        while (pageNumber <= pages) {
            this.doc
                .addPage()
                .fontSize(7);

            for (const [y, row] of grid) {
                for (const [x, cell] of row) {
                    this.drawPixel(
                        this.pixelPositionX(x),
                        this.pixelPositionY(y),
                        cell.color
                    );
                    this.writeIndex(
                        this.indexPosition(this.pixelPositionX(x)),
                        this.indexPosition(this.pixelPositionY(y)),
                        cell.index,
                        cell.indexColor
                    );
                }
            }

            this.addPageNumber(pageNumber, pages);
            this.addSiteMark();
            pageNumber++;
        }
    }

    // private drawGrid(grid: Grid) {
    //     const gridLines = grid.length - 1;
    //     const maxPageHeight = ~~((this.docSize.height - this.docSize.marginTop - this.docSize.marginBottom) / this.pixelSize);
    //     const pages = ~~(gridLines / maxPageHeight) + 1;
    //     let pageNumber = 1;
    //     let k = 0;

    //     while (pageNumber <= pages) {
    //         this.doc
    //             .addPage()
    //             .fontSize(7);
    //         for (let y = 0; y < maxPageHeight; y++) {
    //             for (let x = 0; x < grid[y].length; x++) {
    //                 if (!grid[y + k]) continue;
    //                 this.drawPixel(
    //                     this.pixelPositionX(x),
    //                     this.pixelPositionY(y),
    //                     grid[y + k][x]?.color
    //                 );
    //                 this.writeIndex(
    //                     this.indexPosition(this.pixelPositionX(x)),
    //                     this.indexPosition(this.pixelPositionY(y)),
    //                     grid[y + k][x]?.index,
    //                     grid[y + k][x]?.indexColor
    //                 );
    //             }
    //         }
    //         this.addPageNumber(pageNumber, pages);
    //         this.addSiteMark();
    //         pageNumber++;
    //         k += maxPageHeight;
    //     }
    // }

    private drawPixel(x: number, y: number, color: string) {
        this.doc
            .rect(x, y, this.pixelSize, this.pixelSize)
            .fillAndStroke(color ?? this.WHITE, this.BLACK);
    }

    private writeIndex(x: number, y: number, index: number, color: string) {
        this.doc
            .fillColor(color ?? this.BLACK)
            .text(
                index ? this.charactersSet[index] : this.EMPTY,
                this.indexPosition(x),
                this.indexPosition(y),
                {
                    lineBreak: false,
                });
    }

    private pixelPositionX(x: number): number {
        return x * this.pixelSize + this.docSize.marginLeft;
    }

    private pixelPositionY(y: number): number {
        return y * this.pixelSize + this.docSize.marginTop;
    }

    private indexPosition(pos: number): number {
        return pos + this.pixelSize / 4;
    }

    private calculateDenominator(width: number): number {
        const printSize = this.docSize.width - this.docSize.marginLeft - this.docSize.marginRight;
        const gcd = this.gcd(width, printSize);
        const pixelCount = printSize / gcd - gcd;
        return width / pixelCount;
    }

    private calculatePixelSize(width: number): number {
        const printSize = this.docSize.width - this.docSize.marginLeft - this.docSize.marginRight;
        const gcd = this.gcd(width, printSize);
        const pixelCount = printSize / gcd - gcd;
        return ~~(printSize / pixelCount);
    }

    private gcd(a: number, b: number): number {
        return b === 0 ? a : this.gcd(b, a % b);
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

    private addPageNumber(currentPage: number, totalPages: number) {
        this.doc
            .fontSize(14)
            .fillColor(this.BLACK)
            .text(`${currentPage}/${totalPages}`,
                500,
                800
            );
    }
}
