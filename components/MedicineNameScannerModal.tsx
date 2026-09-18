'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  Zap,
  ZapOff,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Scan,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { createWorker } from 'tesseract.js';

interface MedicineNameScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedicineName: (name: string) => void;
  itemIndex?: number;
}

/**
 * Clean OCR extracted text specifically for medicine / pharmaceutical tablet names
 */
function cleanMedicineName(rawText: string): string {
  if (!rawText) return '';

  // Split into lines
  const lines = rawText
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);

  if (lines.length === 0) return '';

  // Filter out common pharmaceutical noise lines (e.g. Batch, Exp, Mfg, Dosage, Composition)
  const noisePatterns = [
    /\b(b\.?no|batch|mfg|exp|mrp|rs\.?|date|mfd|pkd|lot)\b/i,
    /\b(store below|keep out|dosage|composition|each uncoated|each film|coated tablet)\b/i,
    /\b(warning|schedule|prescription|drug|warning:|caution)\b/i,
    /\b(marketed by|manufactured by|mfg lic|licence)\b/i,
    /\b(tablets?|capsules?|syrup|suspension|injection|cream|gel|ointment)\s*$/i,
    /^[0-9\W]+$/, // purely numbers or symbols
  ];

  const candidateLines = lines.filter((line) => {
    // Keep lines that aren't pure metadata
    return !noisePatterns.some((pattern) => pattern.test(line));
  });

  // Pick the most prominent candidate line
  let primaryLine = candidateLines.length > 0 ? candidateLines[0] : lines[0];

  // Clean leading/trailing special characters
  primaryLine = primaryLine
    .replace(/^[^a-zA-Z0-9]+/, '')
    .replace(/[^a-zA-Z0-9)\]]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Remove trailing "Tab", "Cap" if repetitive, but keep dosage like "650", "500mg", "DSR", "Duo"
  return primaryLine;
}

export function MedicineNameScannerModal({
  isOpen,
  onClose,
  onSelectMedicineName,
  itemIndex = 0,
}: MedicineNameScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const [recognizedName, setRecognizedName] = useState<string>('');
  const [alternativeLines, setAlternativeLines] = useState<string[]>([]);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Start camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await videoRef.current.play();
      }

      // Check torch capability
      const track = newStream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? (track.getCapabilities() as { torch?: boolean }) : {};
      setHasTorch(Boolean(capabilities.torch));
    } catch (err: unknown) {
      console.warn('Camera stream error:', err);
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not access camera. Please allow camera permissions or upload an image.';
      setCameraError(msg);
    }
  }, [facingMode]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setRecognizedName('');
      setAlternativeLines([]);
      setOcrProgress(0);
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Toggle flashlight / torch
  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    try {
      const newTorchState = !isTorchOn;
      // @ts-expect-error torch is valid on mobile Chrome
      await track.applyConstraints({ advanced: [{ torch: newTorchState }] });
      setIsTorchOn(newTorchState);
    } catch (err) {
      console.warn('Torch toggle not supported on this device:', err);
    }
  };

  // Switch Camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Perform OCR on image canvas
  const processImageOCR = async (imageSource: HTMLCanvasElement | string) => {
    setIsScanning(true);
    setOcrProgress(10);

    try {
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && m.progress) {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });

      const result = await worker.recognize(imageSource);
      await worker.terminate();

      const rawText = result.data.text || '';
      const cleaned = cleanMedicineName(rawText);

      // Extract alternative lines for user choice
      const allLines = rawText
        .split(/[\r\n]+/)
        .map((l) => l.trim())
        .filter((l) => l.length >= 2 && l !== cleaned);

      setRecognizedName(cleaned || rawText.slice(0, 30));
      setAlternativeLines(allLines.slice(0, 4));

      // If a strong clean name was detected with high confidence, give user option to confirm
      if (!cleaned && rawText.trim()) {
        setRecognizedName(rawText.trim().split('\n')[0]);
      }
    } catch (err: unknown) {
      console.error('OCR Processing failed:', err);
      setCameraError('Text recognition failed. Please try capturing again with clearer lighting.');
    } finally {
      setIsScanning(false);
    }
  };

  // Capture current video frame inside the rectangular targeting box
  const handleCaptureFrame = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const videoWidth = video.videoWidth || 1280;
    const videoHeight = video.videoHeight || 720;

    // Define the rectangular crop coordinates matching the center targeting box (e.g. 75% width, 30% height)
    const cropWidth = Math.round(videoWidth * 0.75);
    const cropHeight = Math.round(videoHeight * 0.32);
    const cropX = Math.round((videoWidth - cropWidth) / 2);
    const cropY = Math.round((videoHeight - cropHeight) / 2);

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // Draw only the cropped rectangle from video to canvas
    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    // Apply basic contrast enhancement for better tablet strip OCR
    try {
      const imgData = ctx.getImageData(0, 0, cropWidth, cropHeight);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        // Grayscale
        const avg = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        // Contrast boost
        const contrast = 1.2;
        const enhanced = Math.min(255, Math.max(0, (avg - 128) * contrast + 128));
        d[i] = enhanced;
        d[i + 1] = enhanced;
        d[i + 2] = enhanced;
      }
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // Fallback to plain capture
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedImage(dataUrl);

    // Stop camera feed while showing captured result
    stopCamera();

    // Run OCR
    processImageOCR(canvas);
  };

  // Handle Photo upload from device gallery/files
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const imgUrl = reader.result as string;
      setCapturedImage(imgUrl);
      stopCamera();

      // Process uploaded image
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          processImageOCR(canvas);
        }
      };
      img.src = imgUrl;
    };
    reader.readAsDataURL(file);
  };

  // Confirm selection and auto-focus Qty
  const handleConfirmMedicineName = (nameToUse: string) => {
    if (!nameToUse.trim()) return;
    onSelectMedicineName(nameToUse.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-800 flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Scan className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                <span>Scan Medicine / Tablet Name</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
                  Item #{itemIndex + 1}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Focus rectangle on tablet strip or medicine box
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewfinder / Preview Area */}
        <div className="relative flex-1 bg-black min-h-[300px] sm:min-h-[340px] flex items-center justify-center overflow-hidden">
          {/* Live Video Feed */}
          {!capturedImage ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover min-h-[300px]"
              />

              {/* Viewfinder Target Mask with Center Rectangle */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                {/* Top mask */}
                <div className="w-full flex-1 bg-black/50 backdrop-blur-[1px]" />

                {/* Center Scan Window (Rectangle Shape) */}
                <div className="relative w-[85%] sm:w-[80%] h-28 sm:h-32 rounded-2xl border-2 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)] flex items-center justify-center overflow-hidden">
                  {/* Glowing corner brackets */}
                  <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-white rounded-tl" />
                  <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-white rounded-tr" />
                  <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-white rounded-bl" />
                  <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-white rounded-br" />

                  {/* Animated laser scan line */}
                  <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-pulse" />

                  <span className="text-[11px] font-bold text-emerald-300 bg-black/60 px-2.5 py-1 rounded-full border border-emerald-500/40 tracking-wide uppercase">
                    Align Tablet Name Here
                  </span>
                </div>

                {/* Bottom mask */}
                <div className="w-full flex-1 bg-black/50 backdrop-blur-[1px] flex items-center justify-center pb-2">
                  <span className="text-xs text-slate-300 font-medium bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700">
                    Hold steady & press Capture
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* Captured Frozen Image Preview */
            <div className="relative w-full h-full flex flex-col items-center justify-center p-4 bg-slate-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capturedImage}
                alt="Captured tablet crop"
                className="max-h-36 rounded-xl border-2 border-emerald-500/60 shadow-lg object-contain bg-black"
              />

              {isScanning && (
                <div className="mt-4 flex flex-col items-center gap-2 text-emerald-400">
                  <div className="w-8 h-8 border-3 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" />
                  <span className="text-xs font-bold tracking-wide">
                    Recognizing Tablet Name... {ocrProgress}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Hidden Canvas & File Input */}
          <canvas ref={canvasRef} className="hidden" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Error Banner */}
          {cameraError && (
            <div className="absolute top-3 inset-x-3 p-3 bg-rose-950/90 border border-rose-600/60 rounded-xl text-rose-200 text-xs flex items-center gap-2 z-20">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}
        </div>

        {/* Recognition Results & Controls Section */}
        <div className="p-4 bg-slate-900 space-y-3.5 border-t border-slate-800">
          {recognizedName ? (
            /* Recognized Name Confirmation Card */
            <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-2xl p-3.5 space-y-2.5 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Detected Medicine Name</span>
                </span>
                <span className="text-[10px] text-slate-400">Edit or Confirm</span>
              </div>

              {/* Editable Name Input */}
              <div className="relative">
                <input
                  type="text"
                  value={recognizedName}
                  onChange={(e) => setRecognizedName(e.target.value)}
                  className="w-full px-3.5 py-2 text-base font-black text-white bg-slate-800/90 rounded-xl border border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              {/* Alternative detected text candidates */}
              {alternativeLines.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 block">Other detected words:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {alternativeLines.map((alt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setRecognizedName(alt)}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-mono border border-slate-700 hover:border-emerald-500 transition-colors"
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Confirm and Auto-move to Quantity button */}
              <div className="pt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCapturedImage(null);
                    setRecognizedName('');
                    startCamera();
                  }}
                  className="px-3 py-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleConfirmMedicineName(recognizedName)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-slate-950 font-black rounded-xl text-sm shadow-lg shadow-emerald-500/25 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  <span>Insert Name & Move to Qty</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Camera Action Toolbar */
            <div className="flex items-center justify-between gap-3">
              {/* Left tools: Torch & Switch Camera */}
              <div className="flex items-center gap-2">
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isTorchOn
                        ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                    title="Toggle Flashlight"
                  >
                    {isTorchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="p-2.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors"
                  title="Switch Camera"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors"
                  title="Upload from gallery"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Main Capture Button */}
              <button
                type="button"
                onClick={handleCaptureFrame}
                disabled={isScanning}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black rounded-xl text-sm shadow-lg shadow-emerald-500/30 transition-all transform active:scale-95 disabled:opacity-50"
              >
                <Camera className="w-5 h-5" />
                <span>Capture & Scan Name</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
