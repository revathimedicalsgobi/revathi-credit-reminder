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
  MessageSquare,
  VolumeX,
} from 'lucide-react';
import {
  VoiceBillingField,
  parseSingleFieldVoiceInput,
  parseAllInOneVoiceSentence,
  cleanVoiceMedicineName,
  isCompleteCommand,
  isProcessYes,
  isProcessNo,
  extract10DigitPhoneNumber,
  findMatchingCustomer,
} from '@/lib/voice-billing-parser';
import { formatINR } from '@/lib/calculations';

export interface ItemRow {
  id: string;
  itemName: string;
  quantity: string;
  mrp: string;
  discount: string;
}

export interface SavedCustomerItem {
  id: string;
  name: string;
  whatsapp_number: string;
  outstanding_balance?: number;
}

export type VoiceStage =
  | 'IDLE'
  | 'ASK_CUSTOMER_NAME'
  | 'ASK_CUSTOMER_PHONE'
  | 'ASK_ITEM_NAME'
  | 'ASK_QUANTITY'
  | 'ASK_MRP'
  | 'ASK_DISCOUNT'
  | 'ASK_CONFIRM_PROCESS';

interface VoiceBillingBarProps {
  items: ItemRow[];
  activeRowIndex: number;
  setActiveRowIndex: (index: number) => void;
  onUpdateField: (rowId: string, field: keyof Omit<ItemRow, 'id'>, value: string) => void;
  onAddRow: () => void;

  // Conversational interactive Q&A props
  customerName?: string;
  whatsappNumber?: string;
  savedCustomers?: SavedCustomerItem[];
  onSelectCustomer?: (customer: SavedCustomerItem) => void;
  onSetCustomerName?: (name: string) => void;
  onSetWhatsappNumber?: (phone: string) => void;
  onSaveNewCustomer?: (name: string, phone: string) => Promise<boolean | void>;
  totalAmountPayable?: number;
  onConfirmProcess?: () => void;
}

export function VoiceBillingBar({
  items,
  activeRowIndex,
  setActiveRowIndex,
  onUpdateField,
  onAddRow,
  customerName = '',
  whatsappNumber = '',
  savedCustomers = [],
  onSelectCustomer,
  onSetCustomerName,
  onSetWhatsappNumber,
  onSaveNewCustomer,
  totalAmountPayable = 0,
  onConfirmProcess,
}: VoiceBillingBarProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'ta-IN' | 'en-IN'>('en-IN');
  const [voiceStage, setVoiceStage] = useState<VoiceStage>('IDLE');
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [showTips, setShowTips] = useState(false);

  // References to keep event handlers current without re-attaching
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;

  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;

  const voiceStageRef = useRef(voiceStage);
  voiceStageRef.current = voiceStage;

  const activeRowIndexRef = useRef(activeRowIndex);
  activeRowIndexRef.current = activeRowIndex;

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const customerNameRef = useRef(customerName);
  customerNameRef.current = customerName;

  const whatsappNumberRef = useRef(whatsappNumber);
  whatsappNumberRef.current = whatsappNumber;

  const savedCustomersRef = useRef(savedCustomers);
  savedCustomersRef.current = savedCustomers;

  const totalAmountPayableRef = useRef(totalAmountPayable);
  totalAmountPayableRef.current = totalAmountPayable;

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
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
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

  // Text-to-Speech speaking function
  // CRITICAL: Mutes / pauses speech recognition during speaking to avoid hearing its own echo!
  const speakAssistant = useCallback(
    (text: string, onDone?: () => void) => {
      setCurrentPrompt(text);
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        if (onDone) setTimeout(onDone, 300);
        return;
      }

      // Cancel any prior speech
      window.speechSynthesis.cancel();

      // Pause recognition so assistant voice doesn't get picked up
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

      setIsSpeaking(true);
      isSpeakingRef.current = true;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voiceLang;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Select voice matching language if available
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        if (voiceLang === 'ta-IN') {
          const tamilVoice = voices.find((v) => v.lang.toLowerCase().includes('ta'));
          if (tamilVoice) utterance.voice = tamilVoice;
        } else {
          const indianVoice = voices.find(
            (v) =>
              v.lang.toLowerCase().includes('en-in') ||
              v.name.toLowerCase().includes('india')
          );
          if (indianVoice) utterance.voice = indianVoice;
        }
      }

      utterance.onend = () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        // Resume listening if user still wants voice active
        if (isListeningRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch {}
        }
        if (onDone) onDone();
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        if (isListeningRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch {}
        }
        if (onDone) onDone();
      };

      window.speechSynthesis.speak(utterance);
    },
    [voiceLang]
  );

  // Stop active listening and speaking
  const stopListening = useCallback(() => {
    setIsListening(false);
    isListeningRef.current = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setInterimTranscript('');
  }, []);

  // Handle conversational speech input across states
  const handleFinalSpeech = useCallback(
    async (transcript: string) => {
      const clean = transcript.trim();
      if (!clean) return;

      const stage = voiceStageRef.current;
      const currentRow = itemsRef.current[activeRowIndexRef.current] || itemsRef.current[0];

      // ==========================================
      // STAGE 1: ASK_CUSTOMER_NAME
      // ==========================================
      if (stage === 'ASK_CUSTOMER_NAME') {
        const spoken = cleanVoiceMedicineName(clean) || clean;
        const matched = findMatchingCustomer(spoken, savedCustomersRef.current);

        if (matched) {
          // Existing customer found
          playPing();
          if (onSelectCustomer) {
            onSelectCustomer(matched);
          }
          setLastFeedback(`✓ Selected Customer: ${matched.name}`);
          setVoiceStage('ASK_ITEM_NAME');

          const prompt =
            voiceLang === 'ta-IN'
              ? `${matched.name} தேர்வு செய்யப்பட்டது. முதல் மருந்து பெயர் சொல்லுங்கள்.`
              : `Selected ${matched.name}. What is the first medicine name?`;
          speakAssistant(prompt);
          return;
        } else {
          // New customer detected
          playPing();
          if (onSetCustomerName) {
            onSetCustomerName(spoken);
          }
          setLastFeedback(`✓ New Customer: ${spoken}`);
          setVoiceStage('ASK_CUSTOMER_PHONE');

          const prompt =
            voiceLang === 'ta-IN'
              ? `புதிய வாடிக்கையாளர் ${spoken}. வாட்ஸ்அப் மொபைல் எண் சொல்லுங்கள்.`
              : `New customer ${spoken}. Please say their 10-digit mobile number.`;
          speakAssistant(prompt);
          return;
        }
      }

      // ==========================================
      // STAGE 2: ASK_CUSTOMER_PHONE
      // ==========================================
      if (stage === 'ASK_CUSTOMER_PHONE') {
        const phone = extract10DigitPhoneNumber(clean);
        if (phone) {
          playPing();
          if (onSetWhatsappNumber) {
            onSetWhatsappNumber(phone);
          }
          // Directly save to dashboard/master
          if (onSaveNewCustomer && customerNameRef.current) {
            await onSaveNewCustomer(customerNameRef.current, phone);
          }
          setLastFeedback(`✓ Phone: ${phone} | Customer Saved!`);
          setVoiceStage('ASK_ITEM_NAME');

          const prompt =
            voiceLang === 'ta-IN'
              ? `வாடிக்கையாளர் சேமிக்கப்பட்டது. முதல் மருந்து பெயர் சொல்லுங்கள்.`
              : `Customer saved to dashboard. What is the first medicine name?`;
          speakAssistant(prompt);
          return;
        } else {
          // Retry phone
          const prompt =
            voiceLang === 'ta-IN'
              ? `சரியான பத்து இலக்க மொபைல் எண் சொல்லுங்கள்.`
              : `Please say a valid 10-digit mobile number.`;
          speakAssistant(prompt);
          return;
        }
      }

      // ==========================================
      // STAGE 3: ASK_ITEM_NAME
      // ==========================================
      if (stage === 'ASK_ITEM_NAME') {
        // A. Check if user said "Complete" / "Done" / "முடிந்தது"
        if (isCompleteCommand(clean)) {
          // Check if there are any valid items
          const validItems = itemsRef.current.filter((it) => it.itemName.trim() && Number(it.mrp) > 0);
          if (validItems.length === 0) {
            const prompt =
              voiceLang === 'ta-IN'
                ? `பில்லில் மருந்துகள் எதுவும் சேர்க்கப்படவில்லை. மருந்து பெயர் சொல்லுங்கள்.`
                : `No medicines added yet. Please say a medicine name.`;
            speakAssistant(prompt);
            return;
          }

          playPing();
          setVoiceStage('ASK_CONFIRM_PROCESS');
          const totalFormatted = formatINR(totalAmountPayableRef.current);
          const prompt =
            voiceLang === 'ta-IN'
              ? `மொத்த பில் தொகை ரூபாய் ${totalFormatted}. இந்த பில் செயலாக்க வேண்டுமா? ஆம் அல்லது இல்லை என்று சொல்லுங்கள்.`
              : `Total bill is ₹${totalFormatted}. Should I process this bill? Say Yes or No.`;
          speakAssistant(prompt);
          return;
        }

        // B. Check if user spoke an ALL-IN-ONE sentence
        // e.g. "Dolo 650 1 strip mrp 33 point 50 discount 15%"
        const fullSentence = parseAllInOneVoiceSentence(clean);
        if (fullSentence && currentRow) {
          playPing();
          onUpdateField(currentRow.id, 'itemName', fullSentence.itemName);
          onUpdateField(currentRow.id, 'quantity', fullSentence.quantity);
          onUpdateField(currentRow.id, 'mrp', fullSentence.mrp);
          onUpdateField(currentRow.id, 'discount', fullSentence.discount);

          setLastFeedback(`✓ Added ${fullSentence.itemName} | Qty: ${fullSentence.quantity} | MRP: ₹${fullSentence.mrp}`);

          // Create next row for following item
          onAddRow();
          const nextIdx = itemsRef.current.length;
          setActiveRowIndex(nextIdx);
          setVoiceStage('ASK_ITEM_NAME');

          const prompt =
            voiceLang === 'ta-IN'
              ? `${fullSentence.itemName} சேர்க்கப்பட்டது. அடுத்த மருந்து பெயர் சொல்லுங்கள், அல்லது முடிந்தது என்று சொல்லுங்கள்.`
              : `Added ${fullSentence.itemName}. Next medicine name? Or say Complete.`;
          speakAssistant(prompt);
          return;
        }

        // C. Standard single medicine name
        const medName = cleanVoiceMedicineName(clean);
        if (medName.length >= 2 && currentRow) {
          playPing();
          onUpdateField(currentRow.id, 'itemName', medName);
          setLastFeedback(`✓ Product: ${medName}`);
          setVoiceStage('ASK_QUANTITY');

          const prompt =
            voiceLang === 'ta-IN' ? `அளவு எத்தனை?` : `Quantity?`;
          speakAssistant(prompt);
          return;
        }
      }

      // ==========================================
      // STAGE 4: ASK_QUANTITY
      // ==========================================
      if (stage === 'ASK_QUANTITY') {
        const qtyRes = parseSingleFieldVoiceInput(clean, 'quantity');
        if (qtyRes && currentRow) {
          playPing();
          onUpdateField(currentRow.id, 'quantity', qtyRes.value);
          setLastFeedback(`✓ Qty: ${qtyRes.value}`);
          setVoiceStage('ASK_MRP');

          const prompt =
            voiceLang === 'ta-IN' ? `எம்.ஆர்.பி விலை சொல்லுங்கள்` : `MRP price?`;
          speakAssistant(prompt);
          return;
        } else {
          const prompt =
            voiceLang === 'ta-IN'
              ? `அளவு எண்ணாக சொல்லுங்கள். எடுத்துக்காட்டாக ஒன்று அல்லது இரண்டு.`
              : `Please say quantity as a number, like 1 or 2.`;
          speakAssistant(prompt);
          return;
        }
      }

      // ==========================================
      // STAGE 5: ASK_MRP
      // ==========================================
      if (stage === 'ASK_MRP') {
        const mrpRes = parseSingleFieldVoiceInput(clean, 'mrp');
        if (mrpRes && currentRow) {
          playPing();
          onUpdateField(currentRow.id, 'mrp', mrpRes.value);
          setLastFeedback(`✓ MRP: ₹${mrpRes.value}`);
          setVoiceStage('ASK_DISCOUNT');

          const prompt =
            voiceLang === 'ta-IN'
              ? `தள்ளுபடி சதவீதம் எவ்வளவு? இல்லை என்றால் பூஜ்ஜியம் என்று சொல்லுங்கள்.`
              : `Discount percentage? Or say 0.`;
          speakAssistant(prompt);
          return;
        } else {
          const prompt =
            voiceLang === 'ta-IN'
              ? `எம்.ஆர்.பி விலையை சொல்லுங்கள். எடுத்துக்காட்டாக 33 புள்ளி 50.`
              : `Please say MRP price with decimal point.`;
          speakAssistant(prompt);
          return;
        }
      }

      // ==========================================
      // STAGE 6: ASK_DISCOUNT
      // ==========================================
      if (stage === 'ASK_DISCOUNT') {
        const discRes = parseSingleFieldVoiceInput(clean, 'discount');
        if (discRes && currentRow) {
          playPing();
          onUpdateField(currentRow.id, 'discount', discRes.value);
          setLastFeedback(`✓ Disc: ${discRes.value}% | Item Complete!`);

          // Create next item row and advance
          onAddRow();
          const nextIdx = itemsRef.current.length;
          setActiveRowIndex(nextIdx);
          setVoiceStage('ASK_ITEM_NAME');

          const prompt =
            voiceLang === 'ta-IN'
              ? `மருந்து சேர்க்கப்பட்டது. அடுத்த மருந்து பெயர் சொல்லுங்கள், அல்லது முடிந்தது என்று சொல்லுங்கள்.`
              : `Item added. Next medicine name? Or say Complete.`;
          speakAssistant(prompt);
          return;
        } else {
          const prompt =
            voiceLang === 'ta-IN'
              ? `தள்ளுபடி சதவீதம் சொல்லுங்கள். எடுத்துக்காட்டாக 15 அல்லது பூஜ்ஜியம்.`
              : `Please say discount percentage, like 15 or 0.`;
          speakAssistant(prompt);
          return;
        }
      }

      // ==========================================
      // STAGE 7: ASK_CONFIRM_PROCESS
      // ==========================================
      if (stage === 'ASK_CONFIRM_PROCESS') {
        if (isProcessYes(clean)) {
          // User said "Yes" / "Process" / "ஆம்"
          playPing();
          setLastFeedback(`✓ Processing Bill...`);
          stopListening();

          const prompt =
            voiceLang === 'ta-IN'
              ? `பில் செயலாக்கப்படுகிறது. நன்றி!`
              : `Processing bill now. Thank you!`;
          speakAssistant(prompt, () => {
            if (onConfirmProcess) {
              onConfirmProcess();
            }
          });
          return;
        }

        if (isProcessNo(clean)) {
          // User said "No" / "Wait" / "இல்லை"
          playPing();
          setLastFeedback(`✓ Waiting for manual review`);
          stopListening();

          const prompt =
            voiceLang === 'ta-IN'
              ? `சரி, நீங்கள் விவரங்களை சரிபார்த்து process பட்டனை கிளிக் செய்யவும்.`
              : `Waiting for manual review. You can click Process when ready.`;
          speakAssistant(prompt);
          return;
        }

        // Unclear response
        const prompt =
          voiceLang === 'ta-IN'
            ? `பில் செயலாக்க வேண்டுமா? ஆம் அல்லது இல்லை என்று சொல்லுங்கள்.`
            : `Should I process this bill? Please say Yes or No.`;
        speakAssistant(prompt);
      }
    },
    [
      onAddRow,
      onConfirmProcess,
      onSelectCustomer,
      onSetCustomerName,
      onSetWhatsappNumber,
      onSaveNewCustomer,
      onUpdateField,
      playPing,
      setActiveRowIndex,
      speakAssistant,
      stopListening,
      voiceLang,
    ]
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
        // If the computer itself is speaking aloud, ignore incoming audio to prevent self-loop
        if (isSpeakingRef.current) return;

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
        // Auto-restart if user still wants listening active AND assistant is not currently speaking
        if (isListeningRef.current && !isSpeakingRef.current) {
          try {
            recognition.start();
          } catch {}
        } else if (!isListeningRef.current) {
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

  // Main Action: Trigger Conversational Voice Assistant
  const toggleListening = () => {
    if (isListening) {
      stopListening();
      setVoiceStage('IDLE');
    } else {
      startListening();

      // Initiate conversation based on current form state
      if (!customerNameRef.current.trim()) {
        setVoiceStage('ASK_CUSTOMER_NAME');
        const initialPrompt =
          voiceLang === 'ta-IN'
            ? `வாடிக்கையாளர் பெயர் சொல்லுங்கள்`
            : `Please say the customer name`;
        speakAssistant(initialPrompt);
      } else {
        setVoiceStage('ASK_ITEM_NAME');
        const initialPrompt =
          voiceLang === 'ta-IN'
            ? `வாடிக்கையாளர் ${customerNameRef.current}. முதல் மருந்து பெயர் சொல்லுங்கள்.`
            : `Customer is ${customerNameRef.current}. What is the first medicine name?`;
        speakAssistant(initialPrompt);
      }
    }
  };

  // Human-readable stage title
  const getStageBadge = () => {
    switch (voiceStage) {
      case 'ASK_CUSTOMER_NAME':
        return { label: 'Step 1: Customer Name', color: 'bg-blue-500/30 text-blue-300 border-blue-400/30' };
      case 'ASK_CUSTOMER_PHONE':
        return { label: 'Step 1b: Customer Mobile', color: 'bg-purple-500/30 text-purple-300 border-purple-400/30' };
      case 'ASK_ITEM_NAME':
        return { label: `Row #${activeRowIndex + 1}: Medicine Name`, color: 'bg-emerald-500/30 text-emerald-300 border-emerald-400/30' };
      case 'ASK_QUANTITY':
        return { label: `Row #${activeRowIndex + 1}: Quantity`, color: 'bg-emerald-500/30 text-emerald-300 border-emerald-400/30' };
      case 'ASK_MRP':
        return { label: `Row #${activeRowIndex + 1}: MRP (₹)`, color: 'bg-emerald-500/30 text-emerald-300 border-emerald-400/30' };
      case 'ASK_DISCOUNT':
        return { label: `Row #${activeRowIndex + 1}: Discount (%)`, color: 'bg-emerald-500/30 text-emerald-300 border-emerald-400/30' };
      case 'ASK_CONFIRM_PROCESS':
        return { label: 'Final: Process Bill? (Yes / No)', color: 'bg-amber-500/30 text-amber-300 border-amber-400/30 animate-pulse' };
      default:
        return { label: 'AI Voice Assistant', color: 'bg-emerald-500/30 text-emerald-300 border-emerald-400/30' };
    }
  };

  if (!isSupported) {
    return null;
  }

  const badge = getStageBadge();

  return (
    <div className="bg-gradient-to-r from-teal-900 via-emerald-900 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-lg border border-emerald-500/30 space-y-3.5 transition-all">
      {/* Top Bar: Title, Interactive Stage Badge, Language, and Main Mic Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
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
                <span>Interactive Voice Billing Assistant</span>
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.color}`}
              >
                {badge.label}
              </span>
            </div>
            <p className="text-xs text-emerald-200/80 mt-0.5">
              Conversational billing: Asks customer name, medicine details, and confirms bill processing!
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
            title="Speech Recognition & Voice Language"
          >
            <option value="en-IN">🇮🇳 English / Tanglish</option>
            <option value="ta-IN">🇮🇳 தமிழ் (Tamil)</option>
          </select>

          <button
            type="button"
            onClick={() => setShowTips(!showTips)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-emerald-200 text-xs font-semibold transition-colors"
            title="Show voice assistant tips & commands"
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
                <span>Stop Voice ⏹️</span>
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

      {/* Guided Conversational Question & Status Box */}
      <div className="bg-black/40 border border-emerald-500/30 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isSpeaking ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[11px] font-bold animate-pulse">
                <Volume2 className="w-3.5 h-3.5 animate-bounce" />
                <span>Assistant Speaking...</span>
              </div>
            ) : isListening ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-bold">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                <span>Listening for your answer...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/10 text-slate-300 text-[11px] font-medium">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                <span>Ready to start</span>
              </div>
            )}
          </div>

          {/* Repeat Question Button */}
          {currentPrompt && isListening && (
            <button
              type="button"
              onClick={() => speakAssistant(currentPrompt)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 hover:text-emerald-200 bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg transition-colors"
              title="Repeat current question"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Repeat 🔁</span>
            </button>
          )}
        </div>

        {/* Current Active Question Spoken Aloud */}
        {currentPrompt && (
          <div className="p-2.5 bg-emerald-950/60 rounded-lg border border-emerald-500/20 flex items-start gap-2">
            <Volume2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-emerald-100 leading-snug">
              &ldquo;{currentPrompt}&rdquo;
            </p>
          </div>
        )}

        {/* Live Audio Transcript / Feedback */}
        <div className="min-w-0">
          {interimTranscript ? (
            <p className="text-xs font-bold text-amber-300 italic truncate">
              🗣️ Heard: &ldquo;{interimTranscript}...&rdquo;
            </p>
          ) : lastFeedback ? (
            <p className="text-xs font-bold text-emerald-300 flex items-center gap-1 truncate">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>{lastFeedback}</span>
            </p>
          ) : (
            <p className="text-xs text-emerald-200/70 truncate">
              {isListening
                ? 'Speak clearly into your microphone...'
                : 'Click "Start Voice Billing 🎙️" to begin interactive billing conversation'}
            </p>
          )}
        </div>
      </div>

      {/* Guided Step Shortcuts */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-[11px] font-bold text-emerald-300/70 uppercase mr-1">
          Quick Jump:
        </span>

        <button
          type="button"
          onClick={() => {
            setVoiceStage('ASK_CUSTOMER_NAME');
            speakAssistant(voiceLang === 'ta-IN' ? 'வாடிக்கையாளர் பெயர் சொல்லுங்கள்' : 'Please say the customer name');
          }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all text-xs ${
            voiceStage === 'ASK_CUSTOMER_NAME' || voiceStage === 'ASK_CUSTOMER_PHONE'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-white/10 hover:bg-white/20 text-emerald-200'
          }`}
        >
          <span>1. Customer</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-emerald-500/50 flex-shrink-0" />

        <button
          type="button"
          onClick={() => {
            setVoiceStage('ASK_ITEM_NAME');
            speakAssistant(voiceLang === 'ta-IN' ? 'மருந்து பெயர் சொல்லுங்கள்' : 'Please say the medicine name');
          }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all text-xs ${
            voiceStage === 'ASK_ITEM_NAME'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'bg-white/10 hover:bg-white/20 text-emerald-200'
          }`}
        >
          <span>2. Medicine</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-emerald-500/50 flex-shrink-0" />

        <button
          type="button"
          onClick={() => {
            setVoiceStage('ASK_QUANTITY');
            speakAssistant(voiceLang === 'ta-IN' ? 'அளவு எத்தனை?' : 'Quantity?');
          }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all text-xs ${
            voiceStage === 'ASK_QUANTITY'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'bg-white/10 hover:bg-white/20 text-emerald-200'
          }`}
        >
          <span>3. Qty</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-emerald-500/50 flex-shrink-0" />

        <button
          type="button"
          onClick={() => {
            setVoiceStage('ASK_MRP');
            speakAssistant(voiceLang === 'ta-IN' ? 'எம்.ஆர்.பி விலை சொல்லுங்கள்' : 'MRP price?');
          }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all text-xs ${
            voiceStage === 'ASK_MRP'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'bg-white/10 hover:bg-white/20 text-emerald-200'
          }`}
        >
          <span>4. MRP (₹)</span>
        </button>

        <ChevronRight className="w-3.5 h-3.5 text-emerald-500/50 flex-shrink-0" />

        <button
          type="button"
          onClick={() => {
            setVoiceStage('ASK_DISCOUNT');
            speakAssistant(voiceLang === 'ta-IN' ? 'தள்ளுபடி சதவீதம் எவ்வளவு?' : 'Discount percentage?');
          }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all text-xs ${
            voiceStage === 'ASK_DISCOUNT'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'bg-white/10 hover:bg-white/20 text-emerald-200'
          }`}
        >
          <span>5. Disc (%)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setVoiceStage('ASK_CONFIRM_PROCESS');
            const totalFormatted = formatINR(totalAmountPayable);
            const prompt =
              voiceLang === 'ta-IN'
                ? `மொத்த பில் தொகை ரூபாய் ${totalFormatted}. இந்த பில் செயலாக்க வேண்டுமா? ஆம் அல்லது இல்லை என்று சொல்லுங்கள்.`
                : `Total bill is ₹${totalFormatted}. Should I process this bill? Say Yes or No.`;
            speakAssistant(prompt);
          }}
          className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all text-xs ${
            voiceStage === 'ASK_CONFIRM_PROCESS'
              ? 'bg-amber-500 text-slate-950 shadow-md font-black'
              : 'bg-white/15 hover:bg-white/25 text-amber-200 border border-amber-400/30'
          }`}
          title="Conclude bill & ask confirmation"
        >
          <CheckCircle2 className="w-3 h-3 text-amber-300" />
          <span>Say Complete</span>
        </button>
      </div>

      {/* Expandable Tips Panel */}
      {showTips && (
        <div className="p-3.5 bg-black/40 border border-emerald-400/20 rounded-xl text-xs space-y-2 text-emerald-100">
          <div className="font-bold text-emerald-300 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Interactive Voice Billing Guide:</span>
          </div>
          <ul className="space-y-1.5 text-[11px] list-disc list-inside text-emerald-200/90 leading-relaxed">
            <li>
              <strong>1. Customer:</strong> The assistant asks <em>&ldquo;Customer name?&rdquo;</em>. If existing, it auto-selects. If new, it asks for mobile number and adds directly to Dashboard!
            </li>
            <li>
              <strong>2. Medicine & Details:</strong> Assistant asks Medicine Name ➔ Quantity ➔ MRP ➔ Discount.
            </li>
            <li>
              <strong>3. Conclude Bill:</strong> Say <em>&ldquo;Complete&rdquo;</em>, <em>&ldquo;Done&rdquo;</em>, or <em>&ldquo;முடிந்தது&rdquo;</em> anytime when items are finished.
            </li>
            <li>
              <strong>4. Final Confirmation:</strong> Assistant speaks total bill and asks: <em>&ldquo;Should I process this bill? Say Yes or No&rdquo;</em>.
              <br />
              - Say <strong>&ldquo;Yes&rdquo;</strong> (or <em>&ldquo;ஆம்&rdquo;</em>): Automatically submits bill and saves!
              <br />
              - Say <strong>&ldquo;No&rdquo;</strong> (or <em>&ldquo;இல்லை&rdquo;</em>): Holds and waits for you to review and click Process manually!
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
