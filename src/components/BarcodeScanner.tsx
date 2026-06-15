'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

type DetectedBarcode = {
  rawValue: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [nativeSupported, setNativeSupported] = useState(true);

  useEffect(() => {
    let stopped = false;

    async function start() {
      if (!window.BarcodeDetector) {
        setNativeSupported(false);
        setError('BarcodeDetector is not supported in this browser. Enter the code manually.');
        return;
      }

      try {
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (stopped) return;
          const currentVideo = videoRef.current;
          if (currentVideo?.videoWidth && currentVideo.videoHeight) {
            const canvas = document.createElement('canvas');
            canvas.width = currentVideo.videoWidth;
            canvas.height = currentVideo.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(currentVideo, 0, 0);
              const codes = await detector.detect(canvas);
              if (codes[0]?.rawValue) {
                onDetected(codes[0].rawValue);
                return;
              }
            }
          }
          requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Camera failed');
      }
    }

    start();

    return () => {
      stopped = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [onDetected]);

  function submitManual() {
    const code = manualCode.trim();
    if (code) onDetected(code);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 text-white">
      <div className="w-full max-w-3xl space-y-3">
        <div className="flex items-center justify-between">
          <strong>Scan barcode</strong>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">
            Close
          </button>
        </div>

        {nativeSupported ? (
          <video
            ref={videoRef}
            muted
            playsInline
            className="aspect-video w-full rounded-lg bg-black object-cover"
          />
        ) : null}

        <div className="rounded-lg border border-white/15 bg-white/10 p-3">
          <div className="mb-2 text-sm text-white/70">Manual barcode entry</div>
          <div className="flex gap-2">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitManual();
              }}
              className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-white"
              placeholder="Enter barcode"
              autoFocus={!nativeSupported}
            />
            <button onClick={submitManual} className="rounded-lg bg-blue-600 px-4 py-2 hover:bg-blue-500">
              Use
            </button>
          </div>
        </div>

        {error ? <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-100">{error}</div> : null}
      </div>
    </div>
  );
}
