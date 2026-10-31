import { Injectable, BadRequestException } from '@nestjs/common';
import { PDFDocument, StandardFonts, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

@Injectable()
export class FontManagerService {
  private readonly customFontBuffers = new Map<string, Buffer>();

  /**
   * Registers a custom TrueType/OpenType font buffer in memory for embedding.
   */
  registerCustomFont(fontName: string, fontBuffer: Buffer): void {
    if (!fontBuffer || fontBuffer.length === 0) {
      throw new BadRequestException('Font buffer cannot be empty.');
    }
    // Basic magic number validation for TTF / OTF / WOFF
    const isTtfOrOtf =
      fontBuffer.length >= 4 &&
      (fontBuffer.readUInt32BE(0) === 0x00010000 || // TTF 1.0
        fontBuffer.readUInt32BE(0) === 0x4f54544f || // 'OTTO' for CFF OpenType
        fontBuffer.readUInt32BE(0) === 0x74727565); // 'true' for Apple TrueType

    if (!isTtfOrOtf) {
      throw new BadRequestException(
        `Invalid font format for '${fontName}'. Only TrueType (.ttf) and OpenType (.otf) fonts are supported.`,
      );
    }

    this.customFontBuffers.set(fontName.toLowerCase(), fontBuffer);
  }

  /**
   * Resolves and embeds the requested font into the active PDFDocument.
   */
  async resolveFont(
    doc: PDFDocument,
    fontFamily: string,
    fontStyle: 'normal' | 'bold' | 'italic' | 'bold-italic' = 'normal',
  ): Promise<PDFFont> {
    const normalized = fontFamily.toLowerCase().trim();

    // 1. Check custom registered font buffers first
    const customBuffer = this.customFontBuffers.get(normalized);
    if (customBuffer) {
      doc.registerFontkit(fontkit);
      return await doc.embedFont(customBuffer);
    }

    // 2. Map standard PDF 14 fonts
    const standardFont = this.mapStandardFont(fontFamily, fontStyle);
    return await doc.embedFont(standardFont);
  }

  /**
   * Maps family name and style to built-in StandardFonts.
   */
  private mapStandardFont(
    family: string,
    style: 'normal' | 'bold' | 'italic' | 'bold-italic',
  ): StandardFonts {
    const fam = family.toLowerCase().trim();

    if (fam.includes('times') || fam.includes('serif')) {
      if (style === 'bold' || fam.includes('bold')) {
        return style.includes('italic')
          ? StandardFonts.TimesRomanBoldItalic
          : StandardFonts.TimesRomanBold;
      }
      if (style === 'italic' || fam.includes('italic')) {
        return StandardFonts.TimesRomanItalic;
      }
      return StandardFonts.TimesRoman;
    }

    if (fam.includes('courier') || fam.includes('mono')) {
      if (style === 'bold' || fam.includes('bold')) {
        return style.includes('italic')
          ? StandardFonts.CourierBoldOblique
          : StandardFonts.CourierBold;
      }
      if (style === 'italic' || fam.includes('oblique')) {
        return StandardFonts.CourierOblique;
      }
      return StandardFonts.Courier;
    }

    // Default to Helvetica (Sans-Serif)
    if (style === 'bold' || fam.includes('bold')) {
      return style.includes('italic')
        ? StandardFonts.HelveticaBoldOblique
        : StandardFonts.HelveticaBold;
    }
    if (style === 'italic' || fam.includes('oblique')) {
      return StandardFonts.HelveticaOblique;
    }

    return StandardFonts.Helvetica;
  }
}

