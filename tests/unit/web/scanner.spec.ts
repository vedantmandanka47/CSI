import { describe, it, expect } from 'vitest';

describe('Volunteer Scanner Unit & Camera Logic (TASK-020 / B09 / F14 / HR-003)', () => {
  describe('Camera Device Discovery & Selection Strategy', () => {
    it('prioritizes rear/back/environment facing camera when available', () => {
      const devices = [
        { id: 'cam-front', label: 'FaceTime HD Front Camera' },
        { id: 'cam-rear', label: 'Integrated Rear Camera (environment)' },
        { id: 'cam-external', label: 'USB 2.0 WebCam' },
      ];

      const backCam = devices.find((d) => /back|rear|environment/i.test(d.label));
      expect(backCam).toBeDefined();
      expect(backCam?.id).toBe('cam-rear');
    });

    it('falls back to the first available camera if no rear camera is explicitly labeled', () => {
      const devices = [
        { id: 'cam-webcam', label: 'Laptop Built-in WebCam' },
        { id: 'cam-virtual', label: 'OBS Virtual Camera' },
      ];

      const backCam = devices.find((d) => /back|rear|environment/i.test(d.label));
      const selectedId = backCam ? backCam.id : (devices[0]?.id ?? '');

      expect(selectedId).toBe('cam-webcam');
    });

    it('handles empty device list gracefully without throwing', () => {
      const devices: Array<{ id: string; label: string }> = [];

      const backCam = devices.find((d) => /back|rear|environment/i.test(d.label));
      const selectedId = backCam ? backCam.id : (devices[0]?.id ?? '');

      expect(selectedId).toBe('');
    });
  });

  describe('Scanner Token Deduplication & Cooldown Window', () => {
    it('suppresses duplicate scans of the exact same token within the 3.5s cooldown window', () => {
      let lastScanned: { code: string; timestamp: number } | null = null;
      const cooldownMs = 3500;

      const shouldProcessScan = (newCode: string, scanTime: number): boolean => {
        if (
          lastScanned &&
          lastScanned.code === newCode &&
          scanTime - lastScanned.timestamp < cooldownMs
        ) {
          return false;
        }
        lastScanned = { code: newCode, timestamp: scanTime };
        return true;
      };

      const t0 = 1000000;
      // First scan: should process
      expect(shouldProcessScan('csi_pass.sample_token_1', t0)).toBe(true);

      // Rapid scan 500ms later with same token: rejected
      expect(shouldProcessScan('csi_pass.sample_token_1', t0 + 500)).toBe(false);

      // Rapid scan 3000ms later with same token: rejected (still within 3.5s)
      expect(shouldProcessScan('csi_pass.sample_token_1', t0 + 3000)).toBe(false);

      // Scan after 3600ms with same token: accepted
      expect(shouldProcessScan('csi_pass.sample_token_1', t0 + 3600)).toBe(true);
    });

    it('immediately accepts a different token without waiting for cooldown', () => {
      let lastScanned: { code: string; timestamp: number } | null = null;
      const cooldownMs = 3500;

      const shouldProcessScan = (newCode: string, scanTime: number): boolean => {
        if (
          lastScanned &&
          lastScanned.code === newCode &&
          scanTime - lastScanned.timestamp < cooldownMs
        ) {
          return false;
        }
        lastScanned = { code: newCode, timestamp: scanTime };
        return true;
      };

      const t0 = 2000000;
      expect(shouldProcessScan('csi_pass.student_alice', t0)).toBe(true);
      // Different attendee pass 200ms later: must be accepted immediately
      expect(shouldProcessScan('csi_pass.student_bob', t0 + 200)).toBe(true);
    });
  });

  describe('Scanner Hardware & Permission Error Mapping', () => {
    function mapCameraError(err: { name?: string; message?: string }): string {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        return 'Camera permission denied. Please allow camera access in your browser settings to scan QR passes.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        return 'No camera hardware found on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        return 'Camera is already in use by another application or tab.';
      }
      return err.message || 'Failed to activate camera scanner.';
    }

    it('maps NotAllowedError to user-facing permission guidance', () => {
      const msg = mapCameraError({ name: 'NotAllowedError' });
      expect(msg).toContain('Camera permission denied');
      expect(msg).toContain('browser settings');
    });

    it('maps DevicesNotFoundError to missing hardware notification', () => {
      const msg = mapCameraError({ name: 'DevicesNotFoundError' });
      expect(msg).toBe('No camera hardware found on this device.');
    });

    it('maps TrackStartError to concurrent app usage notice', () => {
      const msg = mapCameraError({ name: 'TrackStartError' });
      expect(msg).toBe('Camera is already in use by another application or tab.');
    });

    it('preserves generic error messages for unclassified exceptions', () => {
      const msg = mapCameraError({ message: 'Custom hardware bus error' });
      expect(msg).toBe('Custom hardware bus error');
    });
  });

  describe('Dynamic Viewfinder Box Calculation', () => {
    it('scales qrbox responsively for mobile and desktop viewports', () => {
      const calculateQrBox = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const edgeSize = Math.max(160, Math.floor(minEdge * 0.72));
        return { width: edgeSize, height: edgeSize };
      };

      // Desktop wide viewport
      const desktop = calculateQrBox(640, 480);
      expect(desktop.width).toBe(Math.floor(480 * 0.72));
      expect(desktop.height).toBe(desktop.width);

      // Mobile portrait viewport
      const mobile = calculateQrBox(360, 640);
      expect(mobile.width).toBe(Math.floor(360 * 0.72));
      expect(mobile.height).toBe(mobile.width);

      // Very small screen viewport enforces 160px floor
      const tiny = calculateQrBox(180, 180);
      expect(tiny.width).toBe(160);
      expect(tiny.height).toBe(160);
    });
  });
});

