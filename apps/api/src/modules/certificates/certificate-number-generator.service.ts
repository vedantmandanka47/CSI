import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

@Injectable()
export class CertificateNumberGeneratorService {
  /**
   * Generates a deterministic, collision-resistant, human-readable certificate number.
   * Format: CSI-{YEAR}-{EVENT_ABBR}-{TYPE_ABBR}-{HEX_HASH}
   */
  generateCertificateNumber(
    eventSlug: string,
    recipientEmail: string,
    certificateType: string,
    year: number = new Date().getFullYear(),
  ): string {
    const cleanSlug = eventSlug
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6) || 'EVENT';

    const typeAbbr = certificateType.toUpperCase().slice(0, 4) || 'CERT';

    const normalizedEmail = recipientEmail.toLowerCase().trim();
    const hash = createHash('sha256')
      .update(`${eventSlug}:${normalizedEmail}:${certificateType}:${year}`)
      .digest('hex')
      .slice(0, 6)
      .toUpperCase();

    return `CSI-${year}-${cleanSlug}-${typeAbbr}-${hash}`;
  }
}
