'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Zap,
  ZapOff,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Scan,
  Sparkles,
  ScanLine,
  IndianRupee,
  Check,
} from 'lucide-react';
import { createWorker, Worker, PSM } from 'tesseract.js';

export type ScannerMode = 'name' | 'mrp' | 'all';

export interface OcrResultLine {
  text: string;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  confidence?: number;
}

export interface OcrResultData {
  text: string;
  lines?: OcrResultLine[];
}

export const INDIAN_MEDICINE_LEXICON: string[] = [
  'DOLO', 'CALPOL', 'PAN', 'PAN-D', 'PAN-40', 'PANTOCID', 'PANTOP', 'AUGMENTIN',
  'CLAVAM', 'ZERODOL', 'ZERODOL-SP', 'ZERODOL-P', 'ZERODOL-TH', 'HIFENAC', 'HIFENAC-P',
  'MEFTAL', 'MEFTAL-SPAS', 'COMBIFLAM', 'FLEXON', 'ULTRACET', 'TRAMADOL', 'TAXIM-O',
  'GUDCEF', 'MONOCEF', 'MONOCEF-O', 'ZIFI', 'MAHACEF', 'AZITHRAL', 'AZIWIN', 'AZAX',
  'MOXIKIND', 'MOXIKIND-CV', 'NOVAMOX', 'CIPLOX', 'NORFLOX', 'NORFLOX-TZ', 'OFLOX',
  'ZENFLOX', 'LEVOFLOX', 'MAHAFLOX', 'TELMA', 'TELMA-H', 'TELMA-AM', 'TELMIKIND',
  'AMLONG', 'CILACAR', 'GLYCOMET', 'GLYCOMET-GP', 'JALRA', 'JANUVIA', 'RYZODEG',
  'SHELCAL', 'SHELCAL-500', 'BECOSULES', 'NEUROBION', 'NEUROBION-FORTE', 'SUPRADYN',
  'LIMCEE', 'CELIN', 'ALLEGRA', 'CETRIZINE', 'OKACET', 'LEVOCET', 'MONTAIR', 'MONTAIR-LC',
  'MONTEK', 'MONTEK-LC', 'ASTHALIN', 'DERIPHYLLIN', 'ASCORIL', 'ASCORIL-LS', 'BENADRYL',
  'CHERICOF', 'GRILINCTUS', 'ALEX', 'COREX', 'ZEDEX', 'OMEZ', 'OMEZ-D', 'RAZO',
  'RABECIP', 'ACILOC', 'RANTAC', 'DIGENE', 'GELUSIL', 'CREMAFFIN', 'DUPHALAC',
  'BETADINE', 'SOFRAMYCIN', 'SILVEREX', 'T-BACT', 'VOLINI', 'MOOV', 'OMNIGEL',
  'ATARAX', 'AVOMINE', 'STEMETIL', 'EMESET', 'VOMIKIND', 'ONDEM', 'SPASMO-PROXYVON',
  'CYCLOPAM', 'BUSCOPAN', 'DUOLIN', 'FORACORT', 'BUDECORT', 'SEROFLO', 'BUDESONIDE',
  'ATORVA', 'ATORLIP', 'ROSUVAS', 'ROZAVEL', 'ECOSPRIN', 'CLOPIDOGREL', 'TELMISARTAN',
  'METFORMIN', 'GLIMEPIRIDE', 'VILDAGLIPTIN', 'TENELIGLIPTIN', 'DAPAGLIFLOZIN',
  'PARACETAMOL', 'ACECLOFENAC', 'DICLOFENAC', 'IBUPROFEN', 'AMOXICILLIN',
  'CEFIXIME', 'AZITHROMYCIN', 'PANTOPRAZOLE', 'RABEPRAZOLE', 'OMEPRAZOLE', 'RANITIDINE',
  'LEVOCETIRIZINE', 'MONTELUKAST', 'AMBROXOL', 'GUAIPHENESIN', 'TERBUTALINE',
];

function cleanWord(w: string): string {
  return w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
}

export function analyzeAndExtractBrandName(ocrData: OcrResultData): {
  brandName: string;
  candidates: string[];
} {
  const rawText = ocrData.text || '';
  const lines = rawText.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  const ignoredKeywords = [
    'SCHEDULE', 'PRESCRIPTION', 'DRUG', 'CAUTION', 'WARNING', 'MFG', 'EXP', 'BATCH', 'B.NO',
    'LIC', 'NO.', 'LIMITED', 'PHARMA', 'PHARMACEUTICALS', 'PVT', 'LTD', 'INDIA', 'STORE',
    'COOL', 'DRY', 'PLACE', 'PROTECT', 'LIGHT', 'KEEP', 'REACH', 'CHILDREN', 'DOSAGE',
    'DIRECTED', 'PHYSICIAN', 'TABLETS', 'CAPSULES', 'SYRUP', 'SUSPENSION', 'INJECTION',
    'IP', 'BP', 'USP', 'COMPOSITION', 'EACH', 'FILM', 'COATED', 'CONTAINS', 'UNCOATED',
    'NET', 'QTY', 'PRICE', 'MRP', 'RS', 'TAXES', 'INCLUSIVE'
  ];

  const candidateScores = new Map<string, number>();

  lines.forEach((line, lineIdx) => {
    const words = line.split(/\s+/).map(cleanWord).filter((w) => w.length >= 2);

    for (let i = 0; i < words.length; i++) {
      const single = words[i].toUpperCase();
      const double = i < words.length - 1 ? `${words[i]} ${words[i + 1]}`.toUpperCase() : '';
      const withDosage = i < words.length - 1 && /^[0-9]+(mg|ml|gm|mcg)?$/i.test(words[i + 1])
        ? `${words[i]} ${words[i + 1]}`.toUpperCase()
        : '';

      const testItems = [withDosage, double, single].filter(Boolean);

      for (const item of testItems) {
        if (!item) continue;
        const baseWord = item.split(/\s+/)[0];

        if (ignoredKeywords.some((ign) => baseWord === ign || item.startsWith(ign))) {
          continue;
        }

        let score = 0;

        if (INDIAN_MEDICINE_LEXICON.includes(baseWord)) {
          score += 100;
        } else if (INDIAN_MEDICINE_LEXICON.some((lex) => lex.startsWith(baseWord) || baseWord.startsWith(lex))) {
          score += 60;
        }

        if (/\b(650|500|250|1000|40|20|10|5|625|SP|D|LC|DUO|PLUS|FORTE|DT|SR|CR|XL)\b/i.test(item)) {
          score += 30;
        }

        if (lineIdx < 3) {
          score += 20 - lineIdx * 5;
        }

        if (/^[A-Z0-9\s-]+$/.test(item)) {
          score += 15;
        }

        if (item.length >= 3 && item.length <= 25) {
          score += 10;
        }

        if (score > 0) {
          const current = candidateScores.get(item) || 0;
          candidateScores.set(item, Math.max(current, score));
        }
      }
    }
  });

  const sorted = Array.from(candidateScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0]);

  return {
    brandName: sorted.length > 0 ? sorted[0] : '',
    candidates: sorted.slice(0, 8),
  };
}

export function analyzeAndExtractMRP(ocrData: OcrResultData): {
  price: string;
  candidates: string[];
} {
  const rawText = ocrData.text || '';
  const priceCandidates: string[] = [];

  const patterns = [
    /M[\s.]*R[\s.]*P[\s.:₹Rs]*(?:Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /(?:Rs\.?|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /(?:INCL|TAXES|PRICE)[\s.:₹Rs]*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /\b([0-9]{1,4}\.[0-9]{2})\b/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(rawText)) !== null) {
      const val = match[1] || match[0];
      const cleaned = val.replace(/[^0-9.]/g, '');
      const num = parseFloat(cleaned);
      if (!isNaN(num) && num >= 1 && num <= 25000 && !priceCandidates.includes(cleaned)) {
        priceCandidates.push(cleaned);
      }
    }
  }

  return {
    price: priceCandidates.length > 0 ? priceCandidates[0] : '',
    candidates: priceCandidates.slice(0, 6),
  };
}

interface MedicineNameScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScannedValue: (value: string, mode: ScannerMode) => void;
  onSelectBothValues?: (brandName: string, mrp: string) => void;
  itemIndex?: number;
  initialMode?: ScannerMode;
}

export function MedicineNameScannerModal({
  isOpen,
  onClose,
  onSelectScannedValue,
  onSelectBothValues,
  itemIndex = 0,
  initialMode = 'all',
}: MedicineNameScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const [mode, setMode] = useState<ScannerMode>(initialMode);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // AI Key state
  const [customGeminiKey, setCustomGeminiKey] = useState<string>('');
  const [showAiKeyInput, setShowAiKeyInput] = useState(false);

  // Captured state
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrEngineUsed, setOcrEngineUsed] = useState<'ai' | 'local'>('local');

  // Result fields
  const [detectedBrandName, setDetectedBrandName] = useState<string>('');
  const [detectedMrp, setDetectedMrp] = useState<string>('');
  const [detectedSalt, setDetectedSalt] = useState<string>('');
  const [allDetectedWords, setAllDetectedWords] = useState<string[]>([]);

  // Load custom API key from localStorage
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem('gemini_custom_api_key');
      if (savedKey) setCustomGeminiKey(savedKey);
    } catch {
      // ignore
    }
  }, []);

  // Sync mode when modal opens or initialMode changes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setCapturedImage(null);
      setDetectedBrandName('');
      setDetectedMrp('');
      setDetectedSalt('');
      setAllDetectedWords([]);
      setIsProcessingOcr(false);
      setZoomLevel(1);
    }
  }, [isOpen, initialMode]);

  // Safe Camera Stop without triggering re-renders
  const stopCameraTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Start Camera Stream smoothly (No flickering/blinking)
  const startCamera = useCallback(async (selectedFacing: 'environment' | 'user') => {
    setCameraError(null);
    try {
      stopCameraTracks();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported on this browser.');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: selectedFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // @ts-expect-error macro/continuous autofocus on Android/iOS browsers
          advanced: [{ focusMode: 'continuous' }, { exposureMode: 'continuous' }],
        },
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = newStream;

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await videoRef.current.play();
      }

      // Check torch support
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
  }, []);

  // Initialize Tesseract Worker with High-Precision Parameters
  useEffect(() => {
    let isMounted = true;

    async function initWorker() {
      if (!isOpen) return;
      try {
        if (!workerRef.current) {
          const worker = await createWorker('eng', 1);
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          });
          if (isMounted) {
            workerRef.current = worker;
          } else {
            await worker.terminate();
          }
        }
      } catch (err) {
        console.warn('Tesseract worker init error:', err);
      }
    }

    if (isOpen) {
      initWorker();
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Main Camera Lifecycle
  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setDetectedBrandName('');
      setDetectedMrp('');
      startCamera(facingMode);
    } else {
      stopCameraTracks();
    }

    return () => {
      stopCameraTracks();
    };
  }, [isOpen, facingMode, startCamera]);

  // Clean up worker when component fully unmounts
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Process Capture with AI Vision + Local OCR Fallback
  const processCapturedCanvas = async (canvas: HTMLCanvasElement, rawDataUrl: string) => {
    setIsProcessingOcr(true);

    // 1. Try AI Vision Scan first if key is available or server has key
    try {
      const response = await fetch('/api/scan-medicine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: rawDataUrl,
          customApiKey: customGeminiKey || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && (data.brandName || data.mrp)) {
          setOcrEngineUsed('ai');
          if (data.brandName) setDetectedBrandName(data.brandName);
          if (data.mrp) setDetectedMrp(data.mrp);
          if (data.saltComposition) setDetectedSalt(data.saltComposition);
          if (data.candidates && data.candidates.length > 0) {
            setAllDetectedWords(data.candidates);
          }
          setIsProcessingOcr(false);
          return;
        }
      }
    } catch (aiErr) {
      console.warn('AI Vision scan failed, falling back to local OCR:', aiErr);
    }

    // 2. High-Accuracy Local OCR Fallback
    try {
      setOcrEngineUsed('local');
      if (!workerRef.current) {
        workerRef.current = await createWorker('eng', 1);
        await workerRef.current.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        });
      }

      const result = await workerRef.current.recognize(canvas);
      const ocrData: OcrResultData = {
        text: result.data.text || '',
        // @ts-expect-error Tesseract lines
        lines: result.data.lines,
      };

      const brand = analyzeAndExtractBrandName(ocrData);
      const mrp = analyzeAndExtractMRP(ocrData);

      if (brand && brand.brandName) {
        setDetectedBrandName(brand.brandName);
        setAllDetectedWords(brand.candidates);
      } else {
        const words = ocrData.text.split(/[\r\n\s]+/).filter((w) => w.length >= 3);
        if (words.length > 0) {
          setDetectedBrandName(words[0]);
          setAllDetectedWords(words.slice(0, 8));
        }
      }

      if (mrp && mrp.price) {
        setDetectedMrp(mrp.price);
      } else {
        const numMatch = ocrData.text.match(/\b([0-9]{1,5}\.[0-9]{2})\b/);
        if (numMatch) setDetectedMrp(numMatch[1]);
      }
    } catch (localErr) {
      console.warn('Local OCR error:', localErr);
      setCameraError('Text recognition failed. Please try with clearer focus.');
    } finally {
      setIsProcessingOcr(false);
    }
  };

  // Perform instant High-Resolution Crop Capture
  const handleInstantCapture = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    const canvas = canvasRef.current || document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Apply digital zoom scaling if active
    const cropScale = zoomLevel === 2 ? 0.5 : zoomLevel === 3 ? 0.35 : 0.82;
    const cropWidth = Math.round(videoWidth * cropScale);
    const cropHeight = Math.round(videoHeight * (cropScale * 0.42));
    const cropX = Math.round((videoWidth - cropWidth) / 2);
    const cropY = Math.round((videoHeight - cropHeight) / 2);

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    const frozenDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedImage(frozenDataUrl);

    // Apply high-contrast grayscale preprocessing for foil reflections
    try {
      const imgData = ctx.getImageData(0, 0, cropWidth, cropHeight);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const contrast = 1.35;
        const enhanced = Math.min(255, Math.max(0, (lum - 128) * contrast + 128));
        d[i] = enhanced;
        d[i + 1] = enhanced;
        d[i + 2] = enhanced;
      }
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // ignore
    }

    await processCapturedCanvas(canvas, frozenDataUrl);
  };

  // Reset to live camera feed
  const handleRescan = () => {
    setCapturedImage(null);
    setDetectedBrandName('');
    setDetectedMrp('');
    setDetectedSalt('');
    setAllDetectedWords([]);
    setIsProcessingOcr(false);
    startCamera(facingMode);
  };

  // Confirm values and send back to form
  const handleConfirmValues = () => {
    const brand = detectedBrandName.trim();
    const mrp = detectedMrp.trim();

    if (onSelectBothValues && (brand || mrp)) {
      onSelectBothValues(brand, mrp);
    } else {
      if (mode === 'name' && brand) {
        onSelectScannedValue(brand, 'name');
      } else if (mode === 'mrp' && mrp) {
        onSelectScannedValue(mrp, 'mrp');
      } else if (brand) {
        onSelectScannedValue(brand, 'name');
      } else if (mrp) {
        onSelectScannedValue(mrp, 'mrp');
      }
    }
    onClose();
  };

  // Flashlight / Torch Toggle
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      const newTorchState = !isTorchOn;
      // @ts-expect-error torch is valid on mobile Chrome
      await track.applyConstraints({ advanced: [{ torch: newTorchState }] });
      setIsTorchOn(newTorchState);
    } catch (err) {
      console.warn('Torch toggle not supported:', err);
    }
  };

  // Switch between front and back camera
  const toggleFacingMode = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
  };

  // File Upload fallback
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const imgUrl = reader.result as string;
      setCapturedImage(imgUrl);

      const img = new Image();
      img.onload = async () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          await processCapturedCanvas(canvas, imgUrl);
        }
      };
      img.src = imgUrl;
    };
    reader.readAsDataURL(file);
  };

  // Save AI Vision Key
  const handleSaveGeminiKey = (key: string) => {
    setCustomGeminiKey(key.trim());
    try {
      localStorage.setItem('gemini_custom_api_key', key.trim());
    } catch {
      // ignore
    }
    setShowAiKeyInput(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-800 flex flex-col max-h-[94vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Advanced Medicine Scanner
                </h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
                  Item #{itemIndex + 1}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Auto-extracts Brand Name & MRP simultaneously with AI Vision
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI Key Config Banner Toggle */}
        <div className="bg-slate-950/90 px-3.5 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold text-[11px]">AI Vision & Pharmacy Lexicon Active</span>
          </div>

          <button
            type="button"
            onClick={() => setShowAiKeyInput((prev) => !prev)}
            className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer"
          >
            {customGeminiKey ? 'Custom AI Key Set ✓' : 'Add Gemini AI Key'}
          </button>
        </div>

        {/* Custom API Key Input Drawer */}
        {showAiKeyInput && (
          <div className="p-3 bg-slate-950 border-b border-emerald-500/30 space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-300">
                Google Gemini Vision Key (Optional - 100% Accuracy)
              </span>
              <span className="text-[10px] text-slate-400">Free from Google AI Studio</span>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Paste AI Studio API Key..."
                value={customGeminiKey}
                onChange={(e) => setCustomGeminiKey(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs bg-slate-900 text-white rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
              <button
                type="button"
                onClick={() => handleSaveGeminiKey(customGeminiKey)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Camera Viewfinder / Preview Area */}
        <div className="relative flex-1 bg-black min-h-[300px] sm:min-h-[340px] flex items-center justify-center overflow-hidden">
          {!capturedImage ? (
            /* Live 60FPS Camera Feed with Rectangular Viewfinder */
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover min-h-[300px] transition-transform duration-200 ${
                  zoomLevel === 2 ? 'scale-125' : zoomLevel === 3 ? 'scale-150' : 'scale-100'
                }`}
              />

              {/* Viewfinder Target Mask */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                {/* Top mask */}
                <div className="w-full flex-1 bg-black/55 backdrop-blur-[1px]" />

                {/* Center Scan Rectangle */}
                <div className="relative w-[86%] sm:w-[82%] h-32 sm:h-36 rounded-2xl border-2 border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.4)] transition-all flex items-center justify-center overflow-hidden">
                  {/* Corner Brackets */}
                  <div className="absolute top-1 left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-white rounded-tl" />
                  <div className="absolute top-1 right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-white rounded-tr" />
                  <div className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-white rounded-bl" />
                  <div className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-white rounded-br" />

                  {/* Animated Laser Scan Line */}
                  <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-pulse" />

                  <span className="text-[11px] font-bold bg-black/80 text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/40 tracking-wide uppercase">
                    Align Tablet Name & MRP Here
                  </span>
                </div>

                {/* Bottom mask */}
                <div className="w-full flex-1 bg-black/55 backdrop-blur-[1px] flex items-center justify-center pb-2">
                  <span className="text-xs text-slate-300 font-medium bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700">
                    Align strip in box & tap Capture
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* Frozen Sharp Image Crop Preview with OCR Result */
            <div className="relative w-full h-full flex flex-col items-center justify-center p-4 bg-slate-950 space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capturedImage}
                alt="Captured tablet crop"
                className="max-h-28 rounded-xl border-2 border-emerald-500/60 shadow-lg object-contain bg-black"
              />

              {isProcessingOcr && (
                <div className="flex flex-col items-center gap-2 text-emerald-400">
                  <div className="w-8 h-8 border-3 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" />
                  <span className="text-xs font-bold tracking-wide">
                    {customGeminiKey ? 'Deep AI Vision Analyzing...' : 'Analyzing Brand & MRP...'}
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

        {/* Bottom Result Card / Action Toolbar */}
        <div className="p-3.5 bg-slate-900 border-t border-slate-800">
          {capturedImage && !isProcessingOcr ? (
            /* 2-in-1 Brand Name & MRP Result Confirmation Card */
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Detected Brand Name & MRP</span>
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                  Engine: {ocrEngineUsed === 'ai' ? 'Gemini AI Vision' : 'High-Precision OCR'}
                </span>
              </div>

              {/* Dual Inputs: Brand Name & MRP */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Brand Name Input */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    🏷️ Brand Name:
                  </label>
                  <input
                    type="text"
                    value={detectedBrandName}
                    onChange={(e) => setDetectedBrandName(e.target.value)}
                    placeholder="e.g. Dolo 650"
                    className="w-full px-3 py-2 rounded-xl border text-sm font-black text-white bg-slate-800/90 border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                {/* MRP Input */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    💰 MRP Price (₹):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-400 font-bold text-sm">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={detectedMrp}
                      onChange={(e) => setDetectedMrp(e.target.value)}
                      placeholder="100.00"
                      className="w-full pl-7 pr-3 py-2 rounded-xl border text-sm font-black text-white bg-slate-800/90 border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                  </div>
                </div>
              </div>

              {/* Salt formulation badge if detected */}
              {detectedSalt && (
                <div className="text-[11px] text-slate-300 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 truncate">
                  <span className="text-slate-500 font-medium mr-1">Salt:</span>
                  <span className="font-semibold">{detectedSalt}</span>
                </div>
              )}

              {/* Candidate Chips - Tapping any word pastes it into Brand Name */}
              {allDetectedWords.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 block">Tap any detected word to use:</span>
                  <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                    {allDetectedWords.map((cand, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (/^[0-9.]+$/.test(cand)) {
                            setDetectedMrp(cand);
                          } else {
                            setDetectedBrandName(cand);
                          }
                        }}
                        className="px-2.5 py-1 text-xs rounded-lg border bg-slate-800 hover:bg-emerald-950/80 text-slate-200 border-slate-700 hover:border-emerald-500 transition-all cursor-pointer"
                      >
                        {cand}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons: Rescan & Confirm */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleRescan}
                  className="px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  ↺ Rescan
                </button>

                <button
                  type="button"
                  onClick={handleConfirmValues}
                  disabled={!detectedBrandName.trim() && !detectedMrp.trim()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs sm:text-sm shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Insert Name & MRP</span>
                </button>
              </div>
            </div>
          ) : (
            /* Live Camera Toolbar with Zoom & Capture Button */
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {/* Torch toggle */}
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isTorchOn
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                    }`}
                    title="Toggle Torch / Flashlight"
                  >
                    {isTorchOn ? <Zap className="w-4 h-4 text-amber-400" /> : <ZapOff className="w-4 h-4" />}
                  </button>
                )}

                {/* Digital Zoom toggler (1x / 2x) */}
                <button
                  type="button"
                  onClick={() => setZoomLevel((prev) => (prev === 1 ? 2 : prev === 2 ? 3 : 1))}
                  className="px-2.5 py-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:text-white text-xs font-bold transition-all"
                  title="Zoom Macro Focus"
                >
                  {zoomLevel}x
                </button>

                {/* Switch Camera */}
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="p-2.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:text-white text-xs font-semibold transition-all"
                  title="Switch Camera"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                {/* Gallery Fallback */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:text-white text-xs font-semibold transition-all"
                  title="Upload Photo from Gallery"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Big High-Speed Capture Button */}
              <button
                type="button"
                onClick={handleInstantCapture}
                disabled={isProcessingOcr}
                className="flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-black text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <ScanLine className="w-5 h-5" />
                <span>Capture Medicine</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

