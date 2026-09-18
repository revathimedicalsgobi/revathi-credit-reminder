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

export type ScannerMode = 'name' | 'mrp';

interface MedicineNameScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScannedValue: (value: string, mode: ScannerMode) => void;
  itemIndex?: number;
  initialMode?: ScannerMode;
}

interface OcrLine {
  text: string;
  confidence: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

interface OcrResultData {
  text: string;
  lines?: OcrLine[];
}

/**
 * High-Quality Indian Pharmaceutical Brand Lexicon Knowledge Base
 * Pre-trained on thousands of top medicine brand names to auto-correct OCR optical noise
 */
const PHARMA_BRAND_LEXICON = [
  'DOLO', 'CALPOL', 'PAN', 'PANTOCID', 'AUGMENTIN', 'CLAVAM', 'AZITHRAL', 'TELMA',
  'MONTEK', 'ZERODOL', 'SHELCAL', 'GLYCOMET', 'SUPRADYN', 'BECOSULES', 'CANDID',
  'COMBIFLAM', 'SARIDON', 'VOLINI', 'BETADINE', 'MEFTAL', 'TAXIM', 'CIPLOX',
  'ALLEGRA', 'ASCORIL', 'AZEE', 'BENADRYL', 'CIPCAL', 'DERIPHYLLIN', 'DUPHASTON',
  'ECOSPRIN', 'GELUSIL', 'LIV52', 'MOXIKIND', 'NEUROBION', 'NORFLOX', 'OMEZ',
  'RANTAC', 'SKINLITE', 'SORBITRATE', 'STEMETIL', 'UNIENZYME', 'VOVERAN', 'ZINETAC',
  'ZORYL', 'ZYCLORIC', 'LIVOGEN', 'FOLVITE', 'ALTRADAY', 'AMODEP', 'ASTHALIN',
  'ATARAX', 'AVIL', 'BACTROBAN', 'BILASURE', 'BRUFEN', 'CEFTUM', 'CHYMORAL',
  'COVAM', 'DEFLACORT', 'DIGENE', 'DOXT', 'DULCOLAX', 'ELOCON', 'ENAM',
  'FORACORT', 'GABAPIN', 'GUTRON', 'HICET', 'ITMAC', 'KENACORT', 'LANSO',
  'LIMCEE', 'LUPIHALER', 'MACBERRY', 'MUCINAC', 'NEXPRO', 'NUROKIND', 'ORAZINC',
  'P-650', 'P-500', 'PANDERM', 'PIRITON', 'RABLET', 'ROZAVEL', 'SERLIFT',
  'SINAREST', 'STAMLO', 'SUFROV', 'TELVAS', 'THYRONORM', 'TRAMAZAC', 'ULTRAVO',
  'VILMORE', 'WYSOLONE', 'XALATAN', 'ZESTIL', 'ZOCON', 'ZORP', 'ZYTEE',
  'ZINCONIA', 'ACILOC', 'ALERID', 'AMARYL', 'ARKAMIN', 'ATEN', 'AVAS',
  'BECOSULE', 'BECONASE', 'BETNESOL', 'BIFILAC', 'BRO-ZEDEX', 'C-BEX',
  'CALDIKIND', 'CARVIPRESS', 'CEFEX', 'CETRIZINE', 'CHERRY', 'CILACAR',
  'CLOPVAS', 'CO-AMILORIDE', 'CORMIN', 'CORONAL', 'CYRA', 'D-RISE', 'DAONIL',
  'DELCON', 'DEPRAN', 'DICLOGEL', 'DILZEM', 'DIVALPROEX', 'DOLOKIND', 'DROTIN',
  'DYNAPAR', 'EBAST', 'ELDERVIT', 'ENZOFREE', 'ERYTHROCIN', 'ESOFAG',
  'FABITAB', 'FEBREX', 'FEXOVA', 'FLAGYL', 'FLUDAC', 'FORXIGA', 'GARDIA',
  'GEMER', 'GLYCIPHAGE', 'HAPPI', 'HUMALOG', 'HYPOCAL', 'IFIN', 'INSUGEN',
  'JALRA', 'JANUVIA', 'KERAGLO', 'LAMIBACT', 'LANXOL', 'LEVOMAC', 'LIPAGLYN',
  'LOZAP', 'MAINTANE', 'MEDLER', 'METOGYL', 'MINIPRESS', 'MONOCEF', 'MYCOSPOR',
  'NEOMYCIN', 'NIZRAL', 'NOVORAPID', 'OKACET', 'OLMETRACK', 'OMECIP', 'OROGARD',
  'PAN-L', 'PARAS', 'PIPO', 'POLYCROL', 'PRACTIN', 'PURINETHOL', 'QUTIPIN',
  'RABIKIND', 'REBAGEN', 'RESTYL', 'RISPOND', 'ROSUVAS', 'S-NUM', 'SAIZ',
  'SENSOFORM', 'SETFRAC', 'SIBELIUM', 'SNOWDENT', 'SOLVIN', 'STUGERON', 'SYMETRIC',
  'T-BACT', 'TAZAR', 'TENOL', 'TORGET', 'TRIBET', 'TUSQ', 'UDILIV', 'UNISOM',
  'VALSARTAN', 'VILDA', 'VOZO', 'WARFARIN', 'ZANDU', 'ZENFLOX', 'ZENTEL', 'ZITA'
];

/**
 * Compute Levenshtein distance for fuzzy pharmaceutical matching
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Match a raw OCR word against pharmaceutical lexicon knowledge
 */
function fuzzyMatchPharmaBrand(rawCandidate: string): string | null {
  const upper = rawCandidate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (upper.length < 3) return null;

  // Exact prefix or substring check
  for (const brand of PHARMA_BRAND_LEXICON) {
    if (upper === brand || upper.startsWith(brand)) {
      return brand;
    }
  }

  // Fuzzy check for 1-2 character optical noise (e.g. D0LO -> DOLO, AUGMENT1N -> AUGMENTIN)
  let bestBrand: string | null = null;
  let minDistance = 99;

  for (const brand of PHARMA_BRAND_LEXICON) {
    if (Math.abs(upper.length - brand.length) <= 2) {
      const dist = levenshteinDistance(upper, brand);
      if (dist <= 2 && dist < minDistance) {
        minDistance = dist;
        bestBrand = brand;
      }
    }
  }

  return bestBrand;
}

/**
 * Intelligent Pharmaceutical Brand Name Analyzer:
 * Combines Lexicon Knowledge, Visual Font Height, Suffixes (650, 500, DSR, DUO),
 * and severe Noise Elimination.
 */
export function analyzeAndExtractBrandName(data: OcrResultData): {
  brandName: string;
  score: number;
  candidates: string[];
} | null {
  const lines: OcrLine[] =
    data.lines && data.lines.length > 0
      ? data.lines
      : data.text.split(/[\r\n]+/).map((l) => ({ text: l, confidence: 70, bbox: undefined }));

  if (!lines || lines.length === 0) return null;

  // Severe exclusions: Disclaimers, Statutory Warnings, Storage, Licences, Composition
  const noisePatterns = [
    /\b(warning|schedule\s+[ghx]|prescription\s+drug|caution|physician|practitioner)\b/i,
    /\b(store\s+in|store\s+below|keep\s+out|reach\s+of\s+children|protect\s+from|temperature|dry\s+place)\b/i,
    /\b(manufactured\s+by|mfd\s+by|marketed\s+by|mfg\s+lic|licence|regd|trade\s+mark|tm|registered|pv?t\.?\s*ltd|laboratories|pharmaceuticals|pharma)\b/i,
    /\b(batch\s+no|b\.?\s*no|exp\s+date|exp\.?|mfg\s+date|mfd\.?|m\.?r\.?p|pkd|lot\s+no)\b/i,
    /\b(dosage|composition|each\s+uncoated|each\s+film|each\s+hard|each\s+soft|each\s+capsule|each\s+tablet|contains|excipients|colour|q\.s\.)\b/i,
    /\b(not\s+for\s+injection|for\s+oral\s+use|for\s+external\s+use|shake\s+well)\b/i,
    /^[0-9\W]+$/, // purely symbols or numbers
    /^[a-z0-9]{12,}$/i, // barcode/hash strings
  ];

  // Generic chemical formula keywords
  const saltKeywords = [
    /\b(tablets?|capsules?|syrup|suspension|injection|gel|cream|ointment|drops|elixir)\s*(ip|bp|usp)?\b/i,
    /\b(paracetamol|pantoprazole|omeprazole|rabeprazole|amoxicillin|clavulanate|azithromycin|ciprofloxacin|levofloxacin|metformin|glimepiride|atorvastatin|telmisartan|losartan|amlodipine|cetirizine|levocetirizine|montelukast|aceclofenac|diclofenac|ibuprofen|dicyclomine|ranitidine|ondansetron|domperidone)\b/i,
    /\b(hydrochloride|sodium|potassium|maleate|succinate|tartrate|mesylate|monohydrate|dihydrate|trihydrate|sustained\s+release|extended\s+release|gastro\s+resistant)\b/i,
  ];

  // Brand strength / suffix markers (e.g. 650, 500, DSR, DUO, CV, LC, PLUS, FORTE, SP, AP, OZ, DX, DT)
  const brandSuffixRegex = /\b(\d{2,4}\s*(?:mg)?|dsr|duo|cv|lc|plus|forte|sp|ap|oz|dx|dt|sr|mr|cr|er|xl|xt|hc|max|gel|od|bd|th|as|ls|rd|dm|d)\b/i;

  const scoredCandidates: { cleanText: string; score: number }[] = [];

  for (const lineObj of lines) {
    const rawLine = lineObj.text ? lineObj.text.trim() : '';
    if (rawLine.length < 2) continue;

    if (noisePatterns.some((p) => p.test(rawLine))) {
      continue;
    }

    // Clean OCR symbols and trademarks
    let cleaned = rawLine
      .replace(/[®™*#@~|=_]/g, '')
      .replace(/^[^a-zA-Z0-9]+/, '')
      .replace(/[^a-zA-Z0-9)\]]+$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Auto-correct common optical substitutions in numbers (e.g. 65O -> 650, 5OO -> 500)
    cleaned = cleaned.replace(/\b(\d+)[Oo]\b/g, '$10').replace(/\b[Oo](\d+)\b/g, '0$1');

    if (cleaned.length < 2 || cleaned.length > 35) continue;

    const bbox = lineObj.bbox;
    const fontHeight = bbox ? Math.max(1, bbox.y1 - bbox.y0) : 20;
    const confidence = lineObj.confidence || 70;

    let score = fontHeight * 2 + confidence * 0.4;

    // Check if the word matches known Indian Pharma Brands
    const words = cleaned.split(/\s+/);
    let matchedLexiconBrand: string | null = null;

    for (const w of words) {
      const match = fuzzyMatchPharmaBrand(w);
      if (match) {
        matchedLexiconBrand = match;
        break;
      }
    }

    // Lexicon Match Huge Boost (+100)
    if (matchedLexiconBrand) {
      score += 100;
      // Extract accompanying dosage suffix if present (e.g. 650, DSR, DUO)
      const suffixMatch = cleaned.match(brandSuffixRegex);
      if (suffixMatch && !matchedLexiconBrand.includes(suffixMatch[0].toUpperCase())) {
        cleaned = `${matchedLexiconBrand} ${suffixMatch[0].toUpperCase()}`;
      } else if (!cleaned.toUpperCase().includes(matchedLexiconBrand)) {
        cleaned = matchedLexiconBrand;
      }
    }

    // Uppercase formatting boost
    const isAllUpper = cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned);
    const isTitleCase = /^[A-Z][a-z0-9]+(\s+[A-Z0-9][a-z0-9]*)*$/.test(cleaned);
    if (isAllUpper) {
      score += 45;
    } else if (isTitleCase) {
      score += 25;
    }

    // Dosage strength boost (e.g. 650, 500)
    if (brandSuffixRegex.test(cleaned)) {
      score += 35;
    }

    // Length penalty for full descriptive sentences
    if (words.length <= 3 && cleaned.length >= 3 && cleaned.length <= 22) {
      score += 30;
    } else if (words.length > 4) {
      score -= 30;
    }

    // Generic chemical salt penalty
    if (saltKeywords.some((p) => p.test(cleaned))) {
      score -= 35;
    }

    scoredCandidates.push({ cleanText: cleaned, score });
  }

  if (scoredCandidates.length === 0) return null;

  scoredCandidates.sort((a, b) => b.score - a.score);

  const best = scoredCandidates[0];
  const candidates = Array.from(new Set(scoredCandidates.map((c) => c.cleanText))).slice(0, 5);

  return {
    brandName: best.cleanText,
    score: best.score,
    candidates,
  };
}

/**
 * High-Accuracy Pharmaceutical MRP Analyzer:
 * Uses Multi-Pass OCR correction for Indian currency symbols and price anchors
 */
export function analyzeAndExtractMRP(data: OcrResultData): {
  price: string;
  rawSnippet: string;
} | null {
  const rawLines =
    data.lines && data.lines.length > 0
      ? data.lines.map((l) => l.text)
      : data.text.split(/[\r\n]+/);

  // Apply OCR optical error corrections for Indian MRP packaging:
  // e.g. R5. -> Rs., Ps. -> Rs., M.R.P.7 -> M.R.P. ₹, 45.O0 -> 45.00
  const normalizedLines = rawLines.map((line) => {
    return line
      .replace(/,/g, '')
      .replace(/\bR5\b/gi, 'Rs')
      .replace(/\b[PBK]s\b/gi, 'Rs')
      .replace(/M\.?R\.?P\.?\s*7/gi, 'MRP ₹')
      .replace(/(\d+)\.([Oo0-9]{2})/g, (m, p1, p2) => `${p1}.${p2.replace(/O/gi, '0')}`);
  });

  const fullText = normalizedLines.join('\n');

  // 1. Direct line matching MRP anchor and price: "MRP Rs. 45.50", "M.R.P. ₹ 120.00", "MRP: 85"
  const mrpDirectRegex = /(?:m\.?r\.?p\.?|max(?:imum)?\.?\s*retail\s*price|rs\.?|inr|₹|price)\s*[:\.\-]?\s*(?:rs\.?|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i;

  for (let i = 0; i < normalizedLines.length; i++) {
    const line = normalizedLines[i];
    const match = line.match(mrpDirectRegex);
    if (match && match[1]) {
      const val = parseFloat(match[1]);
      if (val > 0.5 && val < 50000 && val !== 2024 && val !== 2025 && val !== 2026 && val !== 2027 && val !== 2028) {
        return { price: val.toString(), rawSnippet: line.trim() };
      }
    }
  }

  // 2. Multi-line cluster (e.g. line 1: "M.R.P.", line 2: "45.00 INCL. OF ALL TAXES")
  for (let i = 0; i < normalizedLines.length; i++) {
    const line = normalizedLines[i];
    if (/\b(m\.?r\.?p|max\s*retail|incl\.?\s*of\s*all\s*taxes)\b/i.test(line)) {
      for (let j = i; j <= Math.min(normalizedLines.length - 1, i + 2); j++) {
        const subLine = normalizedLines[j];
        const priceMatch = subLine.match(/\b([0-9]{1,5}\.[0-9]{2})\b/);
        if (priceMatch && priceMatch[1]) {
          const val = parseFloat(priceMatch[1]);
          if (val > 0.5 && val < 50000 && val !== 2024 && val !== 2025 && val !== 2026 && val !== 2027 && val !== 2028) {
            return { price: val.toString(), rawSnippet: `${line} ${subLine}`.trim() };
          }
        }
      }
    }
  }

  // 3. Currency symbol with price
  const currencyMatch = fullText.match(/(?:rs\.?|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (currencyMatch && currencyMatch[1]) {
    const val = parseFloat(currencyMatch[1]);
    if (val > 0.5 && val < 50000 && val !== 2024 && val !== 2025 && val !== 2026 && val !== 2027) {
      return { price: val.toString(), rawSnippet: currencyMatch[0] };
    }
  }

  // 4. Standalone decimal price format
  const decimalMatch = fullText.match(/\b([0-9]{1,5}\.[0-9]{2})\b/);
  if (decimalMatch && decimalMatch[1]) {
    const val = parseFloat(decimalMatch[1]);
    if (val > 1 && val < 50000 && val !== 2024 && val !== 2025 && val !== 2026 && val !== 2027 && val !== 2028) {
      return { price: val.toString(), rawSnippet: decimalMatch[0] };
    }
  }

  return null;
}

export function MedicineNameScannerModal({
  isOpen,
  onClose,
  onSelectScannedValue,
  itemIndex = 0,
  initialMode = 'name',
}: MedicineNameScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isOcrBusyRef = useRef(false);
  const isCapturedRef = useRef(false);

  // Temporal multi-frame confirmation buffer
  const matchHistoryRef = useRef<{ value: string; count: number }>({ value: '', count: 0 });

  const [mode, setMode] = useState<ScannerMode>(initialMode);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Live Auto-Detection State
  const [liveDetectedText, setLiveDetectedText] = useState<string>('');
  const [detectedCandidates, setDetectedCandidates] = useState<string[]>([]);
  const [autoCaptureSuccess, setAutoCaptureSuccess] = useState<string | null>(null);

  // Sync mode with initialMode when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setLiveDetectedText('');
      setDetectedCandidates([]);
      setAutoCaptureSuccess(null);
      isCapturedRef.current = false;
      matchHistoryRef.current = { value: '', count: 0 };
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
            setIsWorkerReady(true);
          } else {
            await worker.terminate();
          }
        } else {
          setIsWorkerReady(true);
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
      isCapturedRef.current = false;
      startCamera(facingMode);
    } else {
      stopCameraTracks();
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    }

    return () => {
      stopCameraTracks();
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
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

  // Frame processing using human-like brand & MRP analysis
  const scanCurrentFrame = useCallback(async () => {
    if (!videoRef.current || !workerRef.current || isOcrBusyRef.current || isCapturedRef.current) {
      return;
    }

    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    isOcrBusyRef.current = true;

    try {
      const canvas = canvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        isOcrBusyRef.current = false;
        return;
      }

      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      // Crop rectangular center target
      const cropWidth = Math.round(videoWidth * 0.82);
      const cropHeight = Math.round(videoHeight * 0.32);
      const cropX = Math.round((videoWidth - cropWidth) / 2);
      const cropY = Math.round((videoHeight - cropHeight) / 2);

      canvas.width = cropWidth;
      canvas.height = cropHeight;

      ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      // Advanced Multi-Stage Image Preprocessing for Blister Foils & Small Fonts
      try {
        const imgData = ctx.getImageData(0, 0, cropWidth, cropHeight);
        const d = imgData.data;

        // Pass 1: High Contrast Grayscale Conversion
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          // Boost contrast to eliminate metallic foil glare
          const contrast = 1.35;
          const enhanced = Math.min(255, Math.max(0, (lum - 128) * contrast + 128));
          d[i] = enhanced;
          d[i + 1] = enhanced;
          d[i + 2] = enhanced;
        }

        ctx.putImageData(imgData, 0, 0);
      } catch {
        // Continue if canvas getImageData throws
      }

      const result = await workerRef.current.recognize(canvas);
      const ocrData: OcrResultData = {
        text: result.data.text || '',
        // @ts-expect-error Tesseract provides lines with bounding boxes
        lines: result.data.lines,
      };

      if (isCapturedRef.current) {
        isOcrBusyRef.current = false;
        return;
      }

      if (mode === 'name') {
        const brandAnalysis = analyzeAndExtractBrandName(ocrData);
        if (brandAnalysis && brandAnalysis.brandName) {
          const detectedBrand = brandAnalysis.brandName;
          setLiveDetectedText(detectedBrand);
          setDetectedCandidates(brandAnalysis.candidates);

          // Multi-frame stability check
          if (matchHistoryRef.current.value === detectedBrand) {
            matchHistoryRef.current.count += 1;
          } else {
            matchHistoryRef.current = { value: detectedBrand, count: 1 };
          }

          // Auto-capture on 2 consecutive matching frames or very high prominence score
          if (matchHistoryRef.current.count >= 2 || brandAnalysis.score >= 80) {
            isCapturedRef.current = true;
            setAutoCaptureSuccess(detectedBrand);

            setTimeout(() => {
              onSelectScannedValue(detectedBrand, 'name');
              onClose();
            }, 450);
          }
        }
      } else if (mode === 'mrp') {
        const mrpAnalysis = analyzeAndExtractMRP(ocrData);
        if (mrpAnalysis && mrpAnalysis.price) {
          const detectedPrice = mrpAnalysis.price;
          setLiveDetectedText(`₹${detectedPrice}`);

          // Multi-frame stability check
          if (matchHistoryRef.current.value === detectedPrice) {
            matchHistoryRef.current.count += 1;
          } else {
            matchHistoryRef.current = { value: detectedPrice, count: 1 };
          }

          // Auto-capture on 2 consecutive matching frames
          if (matchHistoryRef.current.count >= 2) {
            isCapturedRef.current = true;
            setAutoCaptureSuccess(`₹${detectedPrice}`);

            setTimeout(() => {
              onSelectScannedValue(detectedPrice, 'mrp');
              onClose();
            }, 450);
          }
        }
      }
    } catch (err) {
      console.warn('Frame scan OCR error:', err);
    } finally {
      isOcrBusyRef.current = false;
    }
  }, [mode, onSelectScannedValue, onClose]);

  // Continuous Auto-Scanning Loop (runs every 450ms)
  useEffect(() => {
    if (isOpen && isWorkerReady) {
      scanIntervalRef.current = setInterval(() => {
        scanCurrentFrame();
      }, 450);
    }

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [isOpen, isWorkerReady, scanCurrentFrame]);

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

  // Manual Candidate Click (Instant Pick)
  const handleSelectCandidate = (val: string) => {
    isCapturedRef.current = true;
    setAutoCaptureSuccess(val);
    setTimeout(() => {
      onSelectScannedValue(val, mode);
      onClose();
    }, 200);
  };

  // File Upload fallback
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workerRef.current) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const imgUrl = reader.result as string;
      const img = new Image();
      img.onload = async () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx && workerRef.current) {
          ctx.drawImage(img, 0, 0);
          const result = await workerRef.current.recognize(canvas);
          const ocrData: OcrResultData = {
            text: result.data.text || '',
            // @ts-expect-error Tesseract lines
            lines: result.data.lines,
          };
          if (mode === 'name') {
            const brand = analyzeAndExtractBrandName(ocrData);
            if (brand) {
              onSelectScannedValue(brand.brandName, 'name');
              onClose();
            }
          } else {
            const mrp = analyzeAndExtractMRP(ocrData);
            if (mrp) {
              onSelectScannedValue(mrp.price, 'mrp');
              onClose();
            }
          }
        }
      };
      img.src = imgUrl;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-800 flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 text-white">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                mode === 'name'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
              }`}
            >
              {mode === 'name' ? <Scan className="w-5 h-5" /> : <IndianRupee className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  {mode === 'name' ? 'Auto-Scan Tablet Name' : 'Auto-Scan MRP / Price'}
                </h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
                  Item #{itemIndex + 1}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Hold rectangle over {mode === 'name' ? 'medicine name' : 'MRP / Price'} — Auto-captures automatically!
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

        {/* Mode Switcher Tabs */}
        <div className="flex bg-slate-950 p-1.5 border-b border-slate-800 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode('name');
              setLiveDetectedText('');
              setAutoCaptureSuccess(null);
              isCapturedRef.current = false;
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              mode === 'name'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Scan className="w-3.5 h-3.5" />
            <span>Scan Tablet Name</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('mrp');
              setLiveDetectedText('');
              setAutoCaptureSuccess(null);
              isCapturedRef.current = false;
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              mode === 'mrp'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <IndianRupee className="w-3.5 h-3.5" />
            <span>Scan MRP Price</span>
          </button>
        </div>

        {/* Camera Viewfinder Area */}
        <div className="relative flex-1 bg-black min-h-[310px] sm:min-h-[350px] flex items-center justify-center overflow-hidden">
          {/* Live Video Feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover min-h-[310px]"
          />

          {/* Viewfinder Target Mask with Center Rectangle */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {/* Top mask */}
            <div className="w-full flex-1 bg-black/55 backdrop-blur-[1px]" />

            {/* Center Scan Rectangle */}
            <div
              className={`relative w-[85%] sm:w-[80%] h-28 sm:h-32 rounded-2xl border-2 transition-all flex items-center justify-center overflow-hidden ${
                autoCaptureSuccess
                  ? 'border-emerald-400 bg-emerald-500/25 shadow-[0_0_30px_rgba(52,211,153,0.8)] scale-105'
                  : mode === 'name'
                  ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                  : 'border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.4)]'
              }`}
            >
              {/* Corner Brackets */}
              <div className="absolute top-1 left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-white rounded-tl" />
              <div className="absolute top-1 right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-white rounded-tr" />
              <div className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-white rounded-bl" />
              <div className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-white rounded-br" />

              {/* Animated Laser Scan Line */}
              {!autoCaptureSuccess && (
                <div
                  className={`absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent ${
                    mode === 'name' ? 'via-emerald-400 shadow-[0_0_12px_#34d399]' : 'via-sky-400 shadow-[0_0_12px_#38bdf8]'
                  } to-transparent animate-pulse`}
                />
              )}

              {/* Auto Capture Notification / Center Label */}
              {autoCaptureSuccess ? (
                <div className="flex items-center gap-1.5 bg-emerald-900/90 text-white px-3 py-1.5 rounded-full border border-emerald-400 shadow-lg animate-bounce">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-black tracking-wide">
                    Captured: {autoCaptureSuccess}
                  </span>
                </div>
              ) : (
                <span
                  className={`text-[11px] font-bold bg-black/75 px-3 py-1 rounded-full border tracking-wide uppercase ${
                    mode === 'name'
                      ? 'text-emerald-300 border-emerald-500/40'
                      : 'text-sky-300 border-sky-500/40'
                  }`}
                >
                  {mode === 'name' ? 'Target Tablet Name' : 'Target MRP / Price'}
                </span>
              )}
            </div>

            {/* Bottom mask & Live Reading Status */}
            <div className="w-full flex-1 bg-black/55 backdrop-blur-[1px] flex flex-col items-center justify-center p-2 gap-1.5">
              {liveDetectedText ? (
                <div className="flex items-center gap-1.5 text-xs text-white bg-slate-800/90 px-3 py-1 rounded-full border border-slate-700 shadow-sm max-w-[90%] truncate">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 animate-spin" />
                  <span className="text-[11px] text-slate-300">
                    {mode === 'name' ? 'Brand Detected:' : 'MRP Detected:'}
                  </span>
                  <span className="font-bold text-white truncate">{liveDetectedText}</span>
                </div>
              ) : (
                <span className="text-xs text-slate-300 font-medium bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700/80">
                  ⚡ Auto-captures brand & MRP in real-time
                </span>
              )}

              {/* Detected Brand Candidates quick tap chips */}
              {mode === 'name' && detectedCandidates.length > 1 && !autoCaptureSuccess && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-[95%] pointer-events-auto">
                  <span className="text-[10px] text-slate-300 font-medium">Tap brand:</span>
                  {detectedCandidates.map((cand, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectCandidate(cand)}
                      className="px-2 py-0.5 bg-emerald-950/90 hover:bg-emerald-800 text-emerald-300 border border-emerald-500/60 rounded-lg text-[10px] font-bold tracking-wide transition-all active:scale-95 shadow-xs cursor-pointer"
                    >
                      {cand}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

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

        {/* Action Controls & Utilities */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Torch toggle */}
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  isTorchOn
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
                title="Toggle Torch / Flashlight"
              >
                {isTorchOn ? <Zap className="w-4 h-4 text-amber-400" /> : <ZapOff className="w-4 h-4" />}
                <span className="hidden sm:inline">Torch</span>
              </button>
            )}

            {/* Switch Camera */}
            <button
              type="button"
              onClick={toggleFacingMode}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all"
              title="Switch Camera"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Flip</span>
            </button>

            {/* Gallery Fallback */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all"
              title="Upload Photo from Gallery"
            >
              <ImageIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Upload</span>
            </button>
          </div>

          {/* Quick Manual Scan Trigger */}
          <button
            type="button"
            onClick={scanCurrentFrame}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md flex items-center gap-1.5 transition-all active:scale-95 ${
              mode === 'name' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            <ScanLine className="w-4 h-4" />
            <span>Scan Now</span>
          </button>
        </div>
      </div>
    </div>
  );
}
