'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Sparkles,
  ChevronRight,
  Plus,
  Volume2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RotateCcw,
} from 'lucide-react';
import {
  VoiceBillingField,
  parseSingleFieldVoiceInput,
  parseAllInOneVoiceSentence,
} from '@/lib/voice-billing-parser';

interface ItemRow {
  id: string;
  itemName: string;
  quantity: string;
  mrp: string;
  discount: string;
}

interface VoiceBillingBarProps {
  items: ItemRow[];
  activeRowIndex: number;
  setActiveRowIndex: (index: number) => void;
  onUpdateField: (rowId: string, field: keyof Omit<ItemRow, 'id'>, value: string) => void;
  onAddRow: () => void;
}

export function VoiceBillingBar({
  items,
  activeRowIndex,
  setActiveRowIndex,
  onUpdateField,
  onAddRow,
}: VoiceBillingBarProps) {
  const [isListening, setIsListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'ta-IN' | 'en-IN'>('en-IN');
  const [currentField, setCurrentField] = useState<VoiceBillingField>('itemName');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [showTips, setShowTips] = useState(false);

  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;

  const activeRowIndexRef = useRef(activeRowIndex);
  activeRowIndexRef.current = activeRowIndex;

  const currentFieldRef = useRef(currentField);
  currentFieldRef.current = currentField;

  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Check browser support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSupported(false);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  // Beep sound confirmation
  const playPing = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }, []);

  // Handle final speech result
  const handleFinalSpeech = useCallback(
    (transcript: string) => {
      const clean = transcript.trim();
      if (!clean) return;

      const currentRow = itemsRef.current[activeRowIndexRef.current] || itemsRef.current[0];
      if (!currentRow) return;

      // 1. Check if the user spoke an ALL-IN-ONE full sentence
      // e.g. "Dolo 650 1 strip mrp 33 point 50 discount 15%"
      const fullSentence = parseAllInOneVoiceSentence(clean);
      if (fullSentence) {
        playPing();
        onUpdateField(currentRow.id, 'itemName', fullSentence.itemName);
        onUpdateField(currentRow.id, 'quantity', fullSentence.quantity);
        onUpdateField(currentRow.id, 'mrp', fullSentence.mrp);
        onUpdateField(currentRow.id, 'discount', fullSentence.discount);

        setLastFeedback(`✓ Added ${fullSentence.itemName} | Qty: ${fullSentence.quantity} | MRP: ₹${fullSentence.mrp} | Disc: ${fullSentence.discount}%`);
        setTimeout(() => setLastFeedback(null), 4000);

        // Auto-add next row and reset field to itemName
        onAddRow();
        const nextIdx = itemsRef.current.length;
        setActiveRowIndex(nextIdx);
        setCurrentField('itemName');
        return;
      }

      // 2. Otherwise, handle STEP-BY-STEP field-by-field guided flow
      const stepResult = parseSingleFieldVoiceInput(clean, currentFieldRef.current);
      if (stepResult) {
        playPing();
        const fieldKey = currentFieldRef.current;
        onUpdateField(currentRow.id, fieldKey, stepResult.value);

        if (stepResult.nextField === 'nextRow') {
          // Finished discount! Advance to next row
          setLastFeedback(`✓ Row Complete! Created next item row...`);
          setTimeout(() => setLastFeedback(null), 3000);
          onAddRow();
          const nextIdx = itemsRef.current.length;
          setActiveRowIndex(nextIdx);
          setCurrentField('itemName');
        } else {
          // Advance to next field in current row
          setCurrentField(stepResult.nextField as VoiceBillingField);
          const labels: Record<string, string> = {
            itemName: 'Product Name',
            quantity: 'Quantity',
            mrp: 'MRP Price',
            discount: 'Discount',
          };
          setLastFeedback(`✓ ${labels[fieldKey] || fieldKey}: ${stepResult.value} ➔ Now speak ${labels[stepResult.nextField] || stepResult.nextField}`);
          setTimeout(() => setLastFeedback(null), 3500);
        }
      }
    },
    [onAddRow, onUpdateField, playPing, setActiveRowIndex]
  );

  // Initialize SpeechRecognition
  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported on this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = voiceLang;

      recognition.onstart = () => {
        setIsListening(true);
        setInterimTranscript('');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            final += text;
          } else {
            interim += text;
          }
        }

        if (interim) {
          setInterimTranscript(interim);
        }

        if (final) {
          setInterimTranscript('');
          handleFinalSpeech(final);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn('Voice billing speech error:', event.error);
        }
      };

      recognition.onend = () => {
        // Auto-restart if user still wants listening active
        if (isListeningRef.current) {
          try {
            recognition.start();
          } catch {}
        } else {
          setIsListening(false);
          setInterimTranscript('');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  }, [handleFinalSpeech, voiceLang]);

  const stopListening = useCallback(() => {
    setIsListening(false);
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setInterimTranscript('');
  }, []);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Helper prompt text for user
  const getPromptHint = () => {
    switch (currentField) {
      case 'itemName':
        return '1️⃣ Speak Medicine / Product Name (e.g. "Dolo 650", "Paracetamol 500")';
      case 'quantity':
        return '2️⃣ Speak Quantity number only (e.g. "1", "2", "1 strip")';
      case 'mrp':
        return '3️⃣ Speak MRP Price with point or புள்ளி (e.g. "33 point 50", "33 புள்ளி 50")';
      case 'discount':
        return '4️⃣ Speak Discount % (e.g. "10", "15", "20", or "0")';
      default:
        return 'Listening for speech input...';
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-teal-900 via-emerald-900 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-lg border border-emerald-500/30 space-y-3.5 transition-all">
      {/* Top Bar: Title, Active Status, Language, and Main Mic Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              isListening
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/50 animate-pulse'
                : 'bg-white/10 text-emerald-400'
            }`}
          >
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold tracking-wide uppercase flex items-center gap-1.5 text-emerald-100">
                <span>Hands-Free Voice Billing</span>
                <span className="text-[10px] bg-emerald-500/30 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-400/30">
                  AI Voice
                </span>
              </h3>
            </div>
            <p className="text-xs text-emerald-200/80 mt-0.5">
              Speak product name, quantity, decimal MRP, & discount to auto-fill!
            </p>
          </div>
        </div>

        {/* Action Controls & Language Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Language toggle: en-IN (Tanglish/English) vs ta-IN (Tamil) */}
          <select
            value={voiceLang}
            onChange={(e) => {
              const newLang = e.target.value as 'ta-IN' | 'en-IN';
              setVoiceLang(newLang);
              if (isListening) {
                stopListening();
                setTimeout(() => startListening(), 200);
              }
            }}
            className="bg-black/30 text-emerald-200 border border-emerald-500/40 text-xs font-bold rounded-xl px-2.5 py-2 focus:outline-none cursor-pointer hover:bg-black/40"
            title="Speech Recognition Language"
          >
            <option value="en-IN">🇮🇳 English / Tanglish</option>
            <option value="ta-IN">🇮🇳 தமிழ் (Tamil)</option>
          </select>

          <button
            type="button"
            onClick={() => setShowTips(!showTips)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-emerald-200 text-xs font-semibold transition-colors"
            title="Show voice commands guide"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Main Voice Toggle Button */}
          <button
            type="button"
            onClick={toggleListening}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold shadow-md transition-all transform active:scale-95 ${
              isListening
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/40 ring-4 ring-rose-500/30'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-emerald-500/30'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-4 h-4 animate-spin" />
                <span>Stop Mic ⏹️</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span>Start Voice Billing 🎙️</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Guided Step-by-Step Pills */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 pt-1 text-xs">
        <span className="text-[11px] font-bold text-emerald-300/70 uppercase mr-1">
          Row #{activeRowIndex + 1}:
        </span>

        <button
          type="button"
          onClick={() => setCurrentField('itemName')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition-all text-xs ${
            currentField === 'itemName'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/40 ring-2 ring-white/50'
              : 'bg-white/10 hover:bg-white/20 text-emerald-200'
          }`}
        >
          <span>1. Product Name</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-emerald-500/50 flex-shrink-0" />

        <button
          type="button"
          onClick={() => setCurrentField('quantity')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition-all text-xs ${
            currentField === 'quantity'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/40 ring-2 ring-white/50'
              : 'bg-white/10 hover:bg-white/20 text-emerald-200'
          }`}
        >
          <span>2. Qty</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-emerald-500/50 flex-shrink-0" />

        <button
          type="button"
          onClick={() => setCurrentField('mrp')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition-all text-xs ${
            currentField === 'mrp'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/40 ring-2 ring-white/50'
              : 'bg-white/10 hover:bg-white/20 text-emerald-200'
          }`}
        >
          <span>3. MRP (₹)</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-emerald-500/50 flex-shrink-0" />

        <button
          type="button"
          onClick={() => setCurrentField('discount')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition-all text-xs ${
            currentField === 'discount'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/40 ring-2 ring-white/50'
              : 'bg-white/10 hover:bg-white/20 text-emerald-200'
          }`}
        >
          <span>4. Disc (%)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onAddRow();
            setActiveRowIndex(items.length);
            setCurrentField('itemName');
          }}
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold bg-white/15 hover:bg-white/25 text-white text-xs border border-white/20"
          title="Add next item row"
        >
          <Plus className="w-3 h-3" />
          <span>New Row</span>
        </button>
      </div>

      {/* Live Speaking Feedback & Hint Box */}
      <div className="bg-black/30 border border-emerald-500/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {isListening ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
              <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full" />
            </div>
          ) : (
            <Volume2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          )}

          <div className="min-w-0">
            {interimTranscript ? (
              <p className="text-xs font-bold text-amber-300 italic truncate">
                🗣️ &ldquo;{interimTranscript}...&rdquo;
              </p>
            ) : lastFeedback ? (
              <p className="text-xs font-bold text-emerald-300 flex items-center gap-1 truncate">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>{lastFeedback}</span>
              </p>
            ) : (
              <p className="text-xs font-medium text-emerald-100/90 truncate">
                {isListening ? getPromptHint() : 'Tap "Start Voice Billing 🎙️" and speak freely into your microphone'}
              </p>
            )}
          </div>
        </div>

        {/* Quick field advance button */}
        {isListening && (
          <div className="flex items-center gap-1.5 self-end sm:self-center">
            <button
              type="button"
              onClick={() => {
                if (currentField === 'itemName') setCurrentField('quantity');
                else if (currentField === 'quantity') setCurrentField('mrp');
                else if (currentField === 'mrp') setCurrentField('discount');
                else if (currentField === 'discount') {
                  onAddRow();
                  setActiveRowIndex(items.length);
                  setCurrentField('itemName');
                }
              }}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-emerald-300 rounded-lg text-[11px] font-bold border border-emerald-500/30"
              title="Skip to next field"
            >
              Skip ➔
            </button>
          </div>
        )}
      </div>

      {/* Expandable Tips Panel */}
      {showTips && (
        <div className="p-3.5 bg-black/40 border border-emerald-400/20 rounded-xl text-xs space-y-2 text-emerald-100">
          <div className="font-bold text-emerald-300 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Voice Billing Tips & Examples:</span>
          </div>
          <ul className="space-y-1 text-[11px] list-disc list-inside text-emerald-200/90 leading-relaxed">
            <li>
              <strong>All-in-One:</strong> Say <em>&ldquo;Dolo 650 1 strip MRP 33 point 50 discount 15%&rdquo;</em> to fill all 4 fields at once!
            </li>
            <li>
              <strong>Step-by-Step:</strong> Say <em>&ldquo;Paracetamol 500&rdquo;</em> ➔ then say <em>&ldquo;2&rdquo;</em> (no need to say Qty) ➔ then say <em>&ldquo;45 point 50&rdquo;</em> ➔ then say <em>&ldquo;10&rdquo;</em>.
            </li>
            <li>
              <strong>Decimals:</strong> You can say <em>&ldquo;point&rdquo;</em> or <em>&ldquo;புள்ளி&rdquo;</em> or <em>&ldquo;pulli&rdquo;</em> (e.g. <em>&ldquo;33 point 50&rdquo;</em> or <em>&ldquo;33 புள்ளி 50&rdquo;</em>).
            </li>
            <li>
              <strong>Zero Discount:</strong> Say <em>&ldquo;0&rdquo;</em> or <em>&ldquo;zero&rdquo;</em> or <em>&ldquo;no discount&rdquo;</em>.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
