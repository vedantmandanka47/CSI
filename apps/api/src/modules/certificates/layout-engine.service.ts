import { Injectable } from '@nestjs/common';
import { PDFFont, rgb, RGB } from 'pdf-lib';
import { TextAlignment } from '@csi/shared';

export interface CalculatedTextBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CalculatedImageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

@Injectable()
export class LayoutEngineService {
  /**
   * Converts a 3-character or 6-character hex color string to pdf-lib RGB (0.0 to 1.0).
   */
  hexToPdfRgb(hex: string): RGB {
    let cleanHex = hex.replace('#', '').trim();
    if (cleanHex.length === 3) {
      cleanHex = cleanHex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const num = parseInt(cleanHex, 16);
    const r = ((num >> 16) & 255) / 255;
    const g = ((num >> 8) & 255) / 255;
    const b = (num & 255) / 255;
    return rgb(r, g, b);
  }

  /**
   * Calculates the exact draw position of a single line of text based on alignment.
   * Coordinate system: PDF origin is bottom-left (0,0).
   */
  calculateTextPosition(
    text: string,
    font: PDFFont,
    fontSize: number,
    x: number,
    y: number,
    alignment: TextAlignment = 'center',
  ): CalculatedTextBounds {
    const width = font.widthOfTextAtSize(text, fontSize);
    const height = font.heightAtSize(fontSize);

    let drawX = x;
    if (alignment === 'center') {
      drawX = x - width / 2;
    } else if (alignment === 'right') {
      drawX = x - width;
    }

    return {
      x: drawX,
      y,
      width,
      height,
    };
  }

  /**
   * Dynamically downscales font size if text width exceeds maxWidth down to minFontSize.
   */
  calculateFittedFontSize(
    text: string,
    font: PDFFont,
    initialFontSize: number,
    maxWidth?: number,
    minFontSize: number = 10,
  ): number {
    if (!maxWidth || maxWidth <= 0) {
      return initialFontSize;
    }

    const currentWidth = font.widthOfTextAtSize(text, initialFontSize);
    if (currentWidth <= maxWidth) {
      return initialFontSize;
    }

    const ratio = maxWidth / currentWidth;
    const scaled = Math.floor(initialFontSize * ratio);
    return Math.max(minFontSize, Math.min(initialFontSize, scaled));
  }

  /**
   * Breaks long text into lines that each fit within maxWidth.
   * Preserves manual newlines (\n).
   */
  wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    if (!maxWidth || maxWidth <= 0) {
      return text.split('\n');
    }

    const paragraphs = text.split('\n');
    const resultLines: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph.trim().length === 0) {
        resultLines.push('');
        continue;
      }

      const words = paragraph.split(/\s+/);
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
        const lineWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (lineWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine.length > 0) {
            resultLines.push(currentLine);
            currentLine = word;
          } else {
            // Word itself is wider than maxWidth; push it anyway to avoid infinite loops
            resultLines.push(word);
            currentLine = '';
          }
        }
      }

      if (currentLine.length > 0) {
        resultLines.push(currentLine);
      }
    }

    return resultLines;
  }

  /**
   * Calculates draw coordinates for image placement with alignment.
   */
  calculateImagePosition(
    width: number,
    height: number,
    x: number,
    y: number,
    alignment: TextAlignment = 'center',
  ): CalculatedImageBounds {
    let drawX = x;
    if (alignment === 'center') {
      drawX = x - width / 2;
    } else if (alignment === 'right') {
      drawX = x - width;
    }

    return {
      x: drawX,
      y,
      width,
      height,
    };
  }
}
