import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, PDFPage, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';
import { createHash } from 'crypto';
import { StudentPassportResponse } from '@csi/shared';

export interface RenderPassportPdfResult {
  pdfBuffer: Buffer;
  fileHash: string;
}

@Injectable()
export class PassportPdfService {
  private readonly logger = new Logger(PassportPdfService.name);

  // Brand Colors (WCAG AA & Indigo Lattice aligned)
  private readonly PRIMARY_COLOR = rgb(0.12, 0.23, 0.55); // #1E3A8A (CSI Blue)
  private readonly ACCENT_COLOR = rgb(0.78, 0.25, 0.18);  // #C8402F (CSI Red)
  private readonly TEXT_DARK = rgb(0.07, 0.10, 0.15);     // #111827
  private readonly TEXT_MUTED = rgb(0.37, 0.41, 0.47);    // #5F6B7A
  private readonly BORDER_COLOR = rgb(0.85, 0.88, 0.92);  // #D9E0EB
  private readonly BG_RAISED = rgb(0.96, 0.97, 0.99);     // #F5F7FB

  /**
   * Generates a multi-page, professional PDF extracurricular dossier.
   */
  async generatePassportPdf(
    passportData: StudentPassportResponse,
    passportNumber: string,
    verificationCode: string,
    verificationUrl: string,
  ): Promise<RenderPassportPdfResult> {
    const doc = await PDFDocument.create();

    // Embed Standard Fonts
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await doc.embedFont(StandardFonts.CourierBold);

    // Page Dimensions (A4 Portrait)
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 42;
    const contentWidth = pageWidth - margin * 2;

    const pages: PDFPage[] = [];

    // Helper to add a new page with standard framing
    const createNewPage = (): { page: PDFPage; startY: number } => {
      const page = doc.addPage([pageWidth, pageHeight]);
      pages.push(page);

      // Top decorative brand bar
      page.drawRectangle({
        x: 0,
        y: pageHeight - 6,
        width: pageWidth,
        height: 6,
        color: this.PRIMARY_COLOR,
      });

      return { page, startY: pageHeight - 35 };
    };

    let { page, startY: currentY } = createNewPage();

    // =========================================================================
    // 1. Institutional Header
    // =========================================================================
    page.drawText('COMPUTER SOCIETY OF INDIA', {
      x: margin,
      y: currentY,
      size: 15,
      font: fontBold,
      color: this.PRIMARY_COLOR,
    });

    currentY -= 15;
    page.drawText('GCET STUDENT BRANCH  |  REGION III', {
      x: margin,
      y: currentY,
      size: 9,
      font: fontBold,
      color: this.ACCENT_COLOR,
    });

    currentY -= 20;
    page.drawText('STUDENT ACTIVITY PASSPORT & EXTRACURRICULAR DOSSIER', {
      x: margin,
      y: currentY,
      size: 12,
      font: fontBold,
      color: this.TEXT_DARK,
    });

    currentY -= 10;
    // Divider line
    page.drawLine({
      start: { x: margin, y: currentY },
      end: { x: pageWidth - margin, y: currentY },
      thickness: 1.5,
      color: this.PRIMARY_COLOR,
    });

    currentY -= 22;

    // =========================================================================
    // 2. Student Identity & Passport Meta Box
    // =========================================================================
    const infoBoxHeight = 64;
    page.drawRectangle({
      x: margin,
      y: currentY - infoBoxHeight + 12,
      width: contentWidth,
      height: infoBoxHeight,
      color: this.BG_RAISED,
      borderColor: this.BORDER_COLOR,
      borderWidth: 1,
    });

    const leftColX = margin + 14;
    const rightColX = margin + 260;
    let infoY = currentY - 2;

    // Left Column
    page.drawText('Student Name:', { x: leftColX, y: infoY, size: 8, font: fontRegular, color: this.TEXT_MUTED });
    page.drawText(passportData.student.name, { x: leftColX + 75, y: infoY, size: 9, font: fontBold, color: this.TEXT_DARK });

    infoY -= 16;
    page.drawText('Branch / Dept:', { x: leftColX, y: infoY, size: 8, font: fontRegular, color: this.TEXT_MUTED });
    page.drawText(passportData.student.branch || 'Engineering & Technology', { x: leftColX + 75, y: infoY, size: 9, font: fontRegular, color: this.TEXT_DARK });

    infoY -= 16;
    page.drawText('Enrollment No:', { x: leftColX, y: infoY, size: 8, font: fontRegular, color: this.TEXT_MUTED });
    page.drawText(passportData.student.enrollmentNo || 'Institutional ID Verified', { x: leftColX + 75, y: infoY, size: 9, font: fontMono, color: this.TEXT_DARK });

    // Right Column
    infoY = currentY - 2;
    page.drawText('Dossier ID:', { x: rightColX, y: infoY, size: 8, font: fontRegular, color: this.TEXT_MUTED });
    page.drawText(passportNumber, { x: rightColX + 65, y: infoY, size: 9, font: fontMono, color: this.PRIMARY_COLOR });

    infoY -= 16;
    page.drawText('Generated On:', { x: rightColX, y: infoY, size: 8, font: fontRegular, color: this.TEXT_MUTED });
    page.drawText(new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }), { x: rightColX + 65, y: infoY, size: 9, font: fontRegular, color: this.TEXT_DARK });

    infoY -= 16;
    page.drawText('Academic Year:', { x: rightColX, y: infoY, size: 8, font: fontRegular, color: this.TEXT_MUTED });
    page.drawText(passportData.student.year ? `Year ${passportData.student.year}` : 'Active Member', { x: rightColX + 65, y: infoY, size: 9, font: fontRegular, color: this.TEXT_DARK });

    currentY -= (infoBoxHeight + 14);

    // =========================================================================
    // 3. Summary Metric Cards
    // =========================================================================
    const cardWidth = (contentWidth - 16) / 3;
    const cardHeight = 38;

    const stats = [
      { label: 'Verified Attendances', value: passportData.summary.eventsAttended.toString() },
      { label: 'Credentials Earned', value: passportData.summary.certificatesEarned.toString() },
      { label: 'Leadership Tenures', value: passportData.summary.committeeTenures.toString() },
    ];

    stats.forEach((stat, i) => {
      const cardX = margin + i * (cardWidth + 8);
      page.drawRectangle({
        x: cardX,
        y: currentY - cardHeight + 8,
        width: cardWidth,
        height: cardHeight,
        color: rgb(1, 1, 1),
        borderColor: this.BORDER_COLOR,
        borderWidth: 1,
      });

      page.drawText(stat.value, {
        x: cardX + 12,
        y: currentY - 14,
        size: 15,
        font: fontBold,
        color: this.PRIMARY_COLOR,
      });

      page.drawText(stat.label, {
        x: cardX + 42,
        y: currentY - 12,
        size: 8,
        font: fontRegular,
        color: this.TEXT_MUTED,
      });
    });

    currentY -= (cardHeight + 18);

    // =========================================================================
    // 4. Section Render Helper with Multi-Page Flow
    // =========================================================================
    const checkPageBreak = (neededHeight: number) => {
      if (currentY - neededHeight < 140) { // Reserve 140pt for verification QR footer on last page
        const newPageInfo = createNewPage();
        page = newPageInfo.page;
        currentY = newPageInfo.startY;

        // Running sub-header on overflow page
        page.drawText('STUDENT ACTIVITY PASSPORT & EXTRACURRICULAR DOSSIER (CONTINUED)', {
          x: margin,
          y: currentY,
          size: 9,
          font: fontBold,
          color: this.TEXT_MUTED,
        });
        currentY -= 18;
        page.drawLine({
          start: { x: margin, y: currentY },
          end: { x: pageWidth - margin, y: currentY },
          thickness: 0.8,
          color: this.BORDER_COLOR,
        });
        currentY -= 16;
      }
    };

    // Text wrapping helper
    const wrapText = (text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] => {
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
          currentLine = candidate;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines.length > 0 ? lines : [text];
    };

    // Filter activities by type
    const committeeRoles = passportData.activities.filter(a => a.type === 'committee_role');
    const certificates = passportData.activities.filter(a => a.type === 'certificate');
    const attendances = passportData.activities.filter(a => a.type === 'event_attendance');

    // Section 1: Committee Responsibilities
    if (committeeRoles.length > 0) {
      checkPageBreak(50);
      page.drawText('LEADERSHIP & COMMITTEE RESPONSIBILITIES', {
        x: margin,
        y: currentY,
        size: 10,
        font: fontBold,
        color: this.PRIMARY_COLOR,
      });
      currentY -= 14;

      for (const role of committeeRoles) {
        checkPageBreak(32);
        const titleLines = wrapText(role.title, contentWidth - 140, fontBold, 9);
        const tenureDesc = role.tenureEnd
          ? `${role.date} to ${role.tenureEnd.split('T')[0]}`
          : `Active (since ${role.date})`;

        page.drawCircle({ x: margin + 7, y: currentY - 2, size: 2.5, color: this.ACCENT_COLOR });
        titleLines.forEach((line, idx) => {
          page.drawText(line, { x: margin + 16, y: currentY - idx * 11, size: 9, font: fontBold, color: this.TEXT_DARK });
        });

        page.drawText(tenureDesc, {
          x: pageWidth - margin - fontRegular.widthOfTextAtSize(tenureDesc, 8),
          y: currentY,
          size: 8,
          font: fontRegular,
          color: this.TEXT_MUTED,
        });

        currentY -= Math.max(18, titleLines.length * 11 + 6);
      }
      currentY -= 8;
    }

    // Section 2: Verified Certificates & Honors
    if (certificates.length > 0) {
      checkPageBreak(50);
      page.drawText('VERIFIED CREDENTIALS & CERTIFICATES', {
        x: margin,
        y: currentY,
        size: 10,
        font: fontBold,
        color: this.PRIMARY_COLOR,
      });
      currentY -= 14;

      for (const cert of certificates) {
        checkPageBreak(34);
        const titleLines = wrapText(cert.title, contentWidth - 160, fontBold, 9);
        const certBadge = cert.certificateNumber || 'Verified Credential';

        page.drawCircle({ x: margin + 7, y: currentY - 2, size: 2.5, color: this.PRIMARY_COLOR });
        titleLines.forEach((line, idx) => {
          page.drawText(line, { x: margin + 16, y: currentY - idx * 11, size: 9, font: fontBold, color: this.TEXT_DARK });
        });

        page.drawText(certBadge, {
          x: pageWidth - margin - fontMono.widthOfTextAtSize(certBadge, 8),
          y: currentY,
          size: 8,
          font: fontMono,
          color: this.TEXT_MUTED,
        });

        currentY -= 12;
        page.drawText(`Issued: ${cert.date}  |  Status: Verified Genuine`, {
          x: margin + 16,
          y: currentY,
          size: 7.5,
          font: fontRegular,
          color: this.TEXT_MUTED,
        });

        currentY -= 12;
      }
      currentY -= 8;
    }

    // Section 3: Verified Event Attendances
    if (attendances.length > 0) {
      checkPageBreak(50);
      page.drawText('VERIFIED TECHNICAL WORKSHOPS & EVENT PARTICIPATION', {
        x: margin,
        y: currentY,
        size: 10,
        font: fontBold,
        color: this.PRIMARY_COLOR,
      });
      currentY -= 14;

      for (const att of attendances) {
        checkPageBreak(28);
        const titleLines = wrapText(att.title, contentWidth - 140, fontRegular, 8.5);

        page.drawCircle({ x: margin + 7, y: currentY - 2, size: 2.5, color: this.PRIMARY_COLOR });
        titleLines.forEach((line, idx) => {
          page.drawText(line, { x: margin + 16, y: currentY - idx * 11, size: 8.5, font: fontRegular, color: this.TEXT_DARK });
        });

        const statusTag = `${att.date} [Verified]`;
        page.drawText(statusTag, {
          x: pageWidth - margin - fontRegular.widthOfTextAtSize(statusTag, 8),
          y: currentY,
          size: 8,
          font: fontRegular,
          color: this.TEXT_MUTED,
        });

        currentY -= Math.max(16, titleLines.length * 11 + 4);
      }
    }

    // Empty state message if zero activities
    if (passportData.activities.length === 0) {
      checkPageBreak(40);
      page.drawText('No verified extracurricular activities recorded for this student tenure yet.', {
        x: margin + 16,
        y: currentY,
        size: 9,
        font: fontRegular,
        color: this.TEXT_MUTED,
      });
      currentY -= 20;
    }

    // =========================================================================
    // 5. Verification QR Code & Anti-Forgery Footer Block
    // =========================================================================
    // The footer always renders on the final page
    const lastPage = pages[pages.length - 1] ?? page;
    const footerY = 115;

    // Divider line above footer
    lastPage.drawLine({
      start: { x: margin, y: footerY },
      end: { x: pageWidth - margin, y: footerY },
      thickness: 1,
      color: this.BORDER_COLOR,
    });

    // Generate high-resolution QR Code buffer
    const qrSize = 65;
    try {
      const qrPngBuffer = await QRCode.toBuffer(verificationUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: Math.round(qrSize * 3),
        color: {
          dark: '#1E3A8A',
          light: '#FFFFFF',
        },
      });

      const qrImage = await doc.embedPng(qrPngBuffer);
      lastPage.drawImage(qrImage, {
        x: margin + 4,
        y: footerY - qrSize - 10,
        width: qrSize,
        height: qrSize,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to render passport verification QR code: ${msg}`);
    }

    // Verification Text Block beside QR code
    const qrTextX = margin + qrSize + 18;
    let qrTextY = footerY - 18;

    lastPage.drawText('OFFICIAL VERIFICATION & CRYPTOGRAPHIC ANTI-FORGERY', {
      x: qrTextX,
      y: qrTextY,
      size: 8.5,
      font: fontBold,
      color: this.PRIMARY_COLOR,
    });

    qrTextY -= 13;
    lastPage.drawText(`Verification Code: ${verificationCode}`, {
      x: qrTextX,
      y: qrTextY,
      size: 9,
      font: fontMono,
      color: this.TEXT_DARK,
    });

    qrTextY -= 12;
    lastPage.drawText('Verification URL: ' + verificationUrl, {
      x: qrTextX,
      y: qrTextY,
      size: 7.5,
      font: fontRegular,
      color: this.TEXT_MUTED,
    });

    qrTextY -= 12;
    lastPage.drawText(
      'Scan the QR code or enter the verification code on the official CSI GCET verification portal to verify genuine issuance and SHA-256 integrity.',
      {
        x: qrTextX,
        y: qrTextY,
        size: 7,
        font: fontRegular,
        color: this.TEXT_MUTED,
        maxWidth: contentWidth - qrSize - 20,
      },
    );

    // =========================================================================
    // 6. Running Page Numbers on All Pages
    // =========================================================================
    const totalPages = pages.length;
    pages.forEach((p, index) => {
      const pageStr = `Page ${index + 1} of ${totalPages}`;
      p.drawText(pageStr, {
        x: pageWidth - margin - fontRegular.widthOfTextAtSize(pageStr, 7.5),
        y: 18,
        size: 7.5,
        font: fontRegular,
        color: this.TEXT_MUTED,
      });

      p.drawText('CSI GCET Student Branch  |  Official Extracurricular Dossier', {
        x: margin,
        y: 18,
        size: 7.5,
        font: fontRegular,
        color: this.TEXT_MUTED,
      });
    });

    // Set document metadata
    doc.setTitle(`Student Activity Passport - ${passportData.student.name}`);
    doc.setAuthor('Computer Society of India - GCET Student Branch');
    doc.setSubject('Extracurricular Dossier & Activity Passport');

    const pdfBytes = await doc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    const fileHash = createHash('sha256').update(pdfBuffer).digest('hex');

    return {
      pdfBuffer,
      fileHash,
    };
  }
}
