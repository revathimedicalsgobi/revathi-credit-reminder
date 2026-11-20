'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Sparkles,
  ChevronRight,
  Plus,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  MessageSquare,
  Radio,
  Play,
  FastForward,
} from 'lucide-react';
import {
  VoiceBillingField,
  parseSingleFieldVoiceInput,
  parseAllInOneVoiceSentence,
  cleanVoiceMedicineName,
  cleanVoiceCustomerName,
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

export type TurnState = 'IDLE' | 'AI_SPEAKING' | 'LISTENING_FOR_USER' | 'PROCESSING';

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
  const [isActiveSession, setIsActiveSession] = useState(false);
  const [turn, setTurn] = useState<TurnState>('IDLE');
  const [voiceLang, setVoiceLang] = useState<'ta-IN' | 'en-IN'>('en-IN');
  const [voiceStage, setVoiceStage] = useState<VoiceStage>('IDLE');
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [showTips, setShowTips] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false); // Toggle: Mute AI voice for ultra-fast visual-only mic flow

  // Mutable refs to prevent stale closures and infinite re-render loops
  const recognitionRef = useRef<any>(null);
  const isActiveSessionRef = useRef(isActiveSession);
  isActiveSessionRef.current = isActiveSession;

  const turnRef = useRef(turn);
  turnRef.current = turn;

  const isAudioMutedRef = useRef(isAudioMuted);
  isAudioMutedRef.current = isAudioMuted;

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

  const echoTimeoutRef = useRef<any>(null);
  const speechFallbackTimerRef = useRef<any>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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
      if (echoTimeoutRef.current) clearTimeout(echoTimeoutRef.current);
      if (speechFallbackTimerRef.current) clearTimeout(speechFallbackTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Crisp audio chime sound when mic starts listening for user
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

  // Hard stop & destroy microphone
  const killRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    setInterimTranscript('');
  }, []);

  // Forward declarations
  const handleFinalSpeechRef = useRef<(text: string) => Promise<void>>();

  // Start listening only when AI has finished speaking (or user clicks Speak Now)
  const startUserMic = useCallback(() => {
    if (!isActiveSessionRef.current) return;

    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Destroy any existing recognition instance first
    killRecognition();

    // Mark state as listening immediately so UI lights up green
    setTurn('LISTENING_FOR_USER');
    turnRef.current = 'LISTENING_FOR_USER';
    setInterimTranscript('');

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // Single utterance per turn prevents runaway echo
      recognition.interimResults = true;
      recognition.lang = voiceLang;

      recognition.onstart = () => {
        setTurn('LISTENING_FOR_USER');
        turnRef.current = 'LISTENING_FOR_USER';
        setInterimTranscript('');
        playPing();
      };

      recognition.onresult = (event: any) => {
        if (turnRef.current !== 'LISTENING_FOR_USER') return;

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

        if (final && final.trim()) {
          // USER FINISHED SPEAKING: Immediately cut off mic to prevent background noise
          killRecognition();
          setTurn('PROCESSING');
          turnRef.current = 'PROCESSING';
          setInterimTranscript('');

          if (handleFinalSpeechRef.current) {
            handleFinalSpeechRef.current(final.trim());
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'audio-capture') {
          // Restart if still user's turn
          if (isActiveSessionRef.current && turnRef.current === 'LISTENING_FOR_USER') {
            setTimeout(() => {
              if (isActiveSessionRef.current && turnRef.current === 'LISTENING_FOR_USER') {
                try {
                  recognition.start();
                } catch {}
              }
            }, 300);
          }
        } else {
          console.warn('Voice billing speech error:', event.error);
        }
      };

      recognition.onend = () => {
        // If it ended while it was still user's turn, smoothly restart
        if (isActiveSessionRef.current && turnRef.current === 'LISTENING_FOR_USER') {
          setTimeout(() => {
            if (isActiveSessionRef.current && turnRef.current === 'LISTENING_FOR_USER') {
              try {
                recognition.start();
              } catch {}
            }
          }, 200);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
    }
  }, [killRecognition, playPing, voiceLang]);

  // Text-to-Speech speaking function with FAILSAFE AUTO-MIC TIMER
  const speakAssistant = useCallback(
    (text: string, onDone?: () => void) => {
      setCurrentPrompt(text);

      // 1. Immediately kill microphone so computer voice CANNOT enter mic
      killRecognition();

      if (echoTimeoutRef.current) clearTimeout(echoTimeoutRef.current);
      if (speechFallbackTimerRef.current) clearTimeout(speechFallbackTimerRef.current);

      const proceedToMic = () => {
        if (speechFallbackTimerRef.current) clearTimeout(speechFallbackTimerRef.current);
        if (activeUtteranceRef.current) activeUtteranceRef.current = null;
        if (!isActiveSessionRef.current) return;
        if (onDone) {
          onDone();
        } else {
          startUserMic();
        }
      };

      // If user muted audio, or browser lacks TTS: Activate mic immediately!
      if (isAudioMutedRef.current || typeof window === 'undefined' || !window.speechSynthesis) {
        setTurn('LISTENING_FOR_USER');
        turnRef.current = 'LISTENING_FOR_USER';
        proceedToMic();
        return;
      }

      setTurn('AI_SPEAKING');
      turnRef.current = 'AI_SPEAKING';

      try {
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        activeUtteranceRef.current = utterance; // Prevent garbage collection in Chrome
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

        let hasFinished = false;

        const onSpeechFinish = () => {
          if (hasFinished) return;
          hasFinished = true;
          if (speechFallbackTimerRef.current) clearTimeout(speechFallbackTimerRef.current);
          if (!isActiveSessionRef.current) return;

          // 250ms echo clearance buffer
          echoTimeoutRef.current = setTimeout(() => {
            proceedToMic();
          }, 250);
        };

        utterance.onend = onSpeechFinish;
        utterance.onerror = onSpeechFinish;

        // CRITICAL FAILSAFE: If Chrome stalls or audio is muted at OS level,
        // automatically activate mic within 2.5 to 4 seconds so the user is NEVER stuck!
        const safeTimeoutDuration = Math.max(2000, Math.min(4500, text.length * 80));
        speechFallbackTimerRef.current = setTimeout(() => {
          if (!hasFinished) {
            console.warn('SpeechSynthesis timeout: failsafe activating user mic');
            onSpeechFinish();
          }
        }, safeTimeoutDuration);

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('Speech synthesis error, activating mic directly:', err);
        proceedToMic();
      }
    },
    [killRecognition, startUserMic, voiceLang]
  );

  // Stop everything
  const stopVoiceSession = useCallback(() => {
    setIsActiveSession(false);
    isActiveSessionRef.current = false;
    setTurn('IDLE');
    turnRef.current = 'IDLE';

    if (echoTimeoutRef.current) clearTimeout(echoTimeoutRef.current);
    if (speechFallbackTimerRef.current) clearTimeout(speechFallbackTimerRef.current);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    killRecognition();
    setInterimTranscript('');
  }, [killRecognition]);

  // Force-start user mic immediately (Skip AI voice or bypass pause)
  const forceStartUserMic = () => {
    if (echoTimeoutRef.current) clearTimeout(echoTimeoutRef.current);
    if (speechFallbackTimerRef.current) clearTimeout(speechFallbackTimerRef.current);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    startUserMic();
  };

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
        // Use intelligent phonetic customer name cleaner ("money building" -> "Mani Building")
        const customerNameSpoken = cleanVoiceCustomerName(clean) || clean;
        const matched = findMatchingCustomer(clean, savedCustomersRef.current) ||
                        findMatchingCustomer(customerNameSpoken, savedCustomersRef.current);

        if (matched) {
          // Existing customer found in master list
          if (onSelectCustomer) {
            onSelectCustomer(matched);
          }
          setLastFeedback(`✓ Found Customer: ${matched.name}`);
          setVoiceStage('ASK_ITEM_NAME');
          voiceStageRef.current = 'ASK_ITEM_NAME';

          const prompt =
            voiceLang === 'ta-IN'
              ? `${matched.name} தேர்வு செய்யப்பட்டது. முதல் மருந்து பெயர் சொல்லுங்கள்.`
              : `Selected ${matched.name}. What is the first medicine name?`;
          speakAssistant(prompt);
          return;
        } else {
          // New customer detected
          if (onSetCustomerName) {
            onSetCustomerName(customerNameSpoken);
          }
          setLastFeedback(`✓ New Customer: ${customerNameSpoken}`);
          setVoiceStage('ASK_CUSTOMER_PHONE');
          voiceStageRef.current = 'ASK_CUSTOMER_PHONE';

          const prompt =
            voiceLang === 'ta-IN'
              ? `புதிய வாடிக்கையாளர் ${customerNameSpoken}. வாட்ஸ்அப் மொபைல் எண் சொல்லுங்கள்.`
              : `New customer ${customerNameSpoken}. Please say their 10-digit mobile number.`;
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
          if (onSetWhatsappNumber) {
            onSetWhatsappNumber(phone);
          }
          // Directly save to dashboard/master
          if (onSaveNewCustomer && customerNameRef.current) {
            await onSaveNewCustomer(customerNameRef.current, phone);
          }
          setLastFeedback(`✓ Mobile: ${phone} | Customer Saved!`);
          setVoiceStage('ASK_ITEM_NAME');
          voiceStageRef.current = 'ASK_ITEM_NAME';

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
          const validItems = itemsRef.current.filter((it) => it.itemName.trim() && Number(it.mrp) > 0);
          if (validItems.length === 0) {
            const prompt =
              voiceLang === 'ta-IN'
                ? `பில்லில் மருந்துகள் சேர்க்கப்படவில்லை. மருந்து பெயர் சொல்லுங்கள்.`
                : `No medicines added yet. Please say a medicine name.`;
            speakAssistant(prompt);
            return;
          }

          setVoiceStage('ASK_CONFIRM_PROCESS');
          voiceStageRef.current = 'ASK_CONFIRM_PROCESS';
          const totalFormatted = formatINR(totalAmountPayableRef.current);
          const prompt =
            voiceLang === 'ta-IN'
              ? `மொத்த பில் தொகை ரூபாய் ${totalFormatted}. இந்த பில் செயலாக்க வேண்டுமா? ஆம் அல்லது இல்லை என்று சொல்லுங்கள்.`
              : `Total bill is ₹${totalFormatted}. Should I process this bill? Say Yes or No.`;
          speakAssistant(prompt);
          return;
        }

        // B. Check if user spoke an ALL-IN-ONE sentence (e.g. "Dolo 650 1 strip mrp 33.50 discount 15%")
        const fullSentence = parseAllInOneVoiceSentence(clean);
        if (fullSentence && currentRow) {
          onUpdateField(currentRow.id, 'itemName', fullSentence.itemName);
          onUpdateField(currentRow.id, 'quantity', fullSentence.quantity);
          onUpdateField(currentRow.id, 'mrp', fullSentence.mrp);
          onUpdateField(currentRow.id, 'discount', fullSentence.discount);

          setLastFeedback(`✓ Added ${fullSentence.itemName} | Qty: ${fullSentence.quantity} | MRP: ₹${fullSentence.mrp}`);

          // Create next row
          onAddRow();
          const nextIdx = itemsRef.current.length;
          setActiveRowIndex(nextIdx);
          setVoiceStage('ASK_ITEM_NAME');
          voiceStageRef.current = 'ASK_ITEM_NAME';

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
          onUpdateField(currentRow.id, 'itemName', medName);
          setLastFeedback(`✓ Product: ${medName}`);
          setVoiceStage('ASK_QUANTITY');
          voiceStageRef.current = 'ASK_QUANTITY';

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
          onUpdateField(currentRow.id, 'quantity', qtyRes.value);
          setLastFeedback(`✓ Qty: ${qtyRes.value}`);
          setVoiceStage('ASK_MRP');
          voiceStageRef.current = 'ASK_MRP';

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
          onUpdateField(currentRow.id, 'mrp', mrpRes.value);
          setLastFeedback(`✓ MRP: ₹${mrpRes.value}`);
          setVoiceStage('ASK_DISCOUNT');
          voiceStageRef.current = 'ASK_DISCOUNT';

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
          onUpdateField(currentRow.id, 'discount', discRes.value);
          setLastFeedback(`✓ Disc: ${discRes.value}% | Item Added!`);

          // Create next item row and advance
          onAddRow();
          const nextIdx = itemsRef.current.length;
          setActiveRowIndex(nextIdx);
          setVoiceStage('ASK_ITEM_NAME');
          voiceStageRef.current = 'ASK_ITEM_NAME';

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
          setLastFeedback(`✓ Processing Bill...`);
          stopVoiceSession();

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
          setLastFeedback(`✓ Waiting for manual review`);
          stopVoiceSession();

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
      setActiveRowIndex,
      speakAssistant,
      stopVoiceSession,
      voiceLang,
    ]
  );

  handleFinalSpeechRef.current = handleFinalSpeech;

  // Main Action: Trigger Conversational Voice Assistant
  const toggleListening = () => {
    if (isActiveSession) {
      stopVoiceSession();
      setVoiceStage('IDLE');
      voiceStageRef.current = 'IDLE';
    } else {
      setIsActiveSession(true);
      isActiveSessionRef.current = true;

      // Initiate conversation based on current form state
      if (!customerNameRef.current.trim()) {
        setVoiceStage('ASK_CUSTOMER_NAME');
        voiceStageRef.current = 'ASK_CUSTOMER_NAME';
        const initialPrompt =
          voiceLang === 'ta-IN'
            ? `வாடிக்கையாளர் பெயர் சொல்லுங்கள்`
            : `Please say the customer name`;
        speakAssistant(initialPrompt);
      } else {
        setVoiceStage('ASK_ITEM_NAME');
        voiceStageRef.current = 'ASK_ITEM_NAME';
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
              isActiveSession
                ? turn === 'LISTENING_FOR_USER'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/50 animate-pulse'
                  : 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/50'
                : 'bg-white/10 text-emerald-400'
            }`}
          >
            {isActiveSession && turn === 'AI_SPEAKING' ? (
              <Volume2 className="w-5 h-5 animate-bounce" />
            ) : isActiveSession && turn === 'LISTENING_FOR_USER' ? (
              <Mic className="w-5 h-5 animate-pulse" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
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
              Turn-based voice assistant: Mic auto-activates with chime when AI finishes question!
            </p>
          </div>
        </div>

        {/* Action Controls & Language Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Audio Speaker Mute Toggle: Allows silent ultra-fast mode or audio mode */}
          <button
            type="button"
            onClick={() => {
              const nextMute = !isAudioMuted;
              setIsAudioMuted(nextMute);
              isAudioMutedRef.current = nextMute;
              if (nextMute && turn === 'AI_SPEAKING') {
                forceStartUserMic();
              }
            }}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
              isAudioMuted
                ? 'bg-rose-500/30 text-rose-300 border-rose-500/50'
                : 'bg-white/10 text-emerald-300 border-white/20 hover:bg-white/20'
            }`}
            title={isAudioMuted ? 'Voice audio is muted (Mic opens instantly)' : 'Voice audio is active'}
          >
            {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>{isAudioMuted ? 'Voice Muted 🔇' : 'AI Voice 🔊'}</span>
          </button>

          {/* Language toggle: en-IN (Tanglish/English) vs ta-IN (Tamil) */}
          <select
            value={voiceLang}
            onChange={(e) => {
              const newLang = e.target.value as 'ta-IN' | 'en-IN';
              setVoiceLang(newLang);
              if (isActiveSession) {
                stopVoiceSession();
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
              isActiveSession
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/40 ring-4 ring-rose-500/30'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-emerald-500/30'
            }`}
          >
            {isActiveSession ? (
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

      {/* Guided Turn Status & Question Box */}
      <div className="bg-black/40 border border-emerald-500/30 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Active Turn Indicator */}
          <div className="flex items-center gap-2 min-w-0">
            {turn === 'AI_SPEAKING' ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/25 text-amber-200 border border-amber-400/40 text-xs font-black animate-pulse">
                <Volume2 className="w-4 h-4 text-amber-300 animate-bounce" />
                <span>AI Speaking Question... (Mic Paused 🔇)</span>
              </div>
            ) : turn === 'LISTENING_FOR_USER' ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 text-xs font-black ring-2 ring-emerald-500/30">
                <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
                <Mic className="w-4 h-4 text-emerald-300" />
                <span>Mic Active — Speak Now 🎙️</span>
              </div>
            ) : turn === 'PROCESSING' ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-500/25 text-sky-200 border border-sky-400/40 text-xs font-bold">
                <span className="w-2 h-2 bg-sky-400 rounded-full animate-spin" />
                <span>Processing your answer...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 text-slate-300 text-xs font-medium">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                <span>Ready to start voice billing</span>
              </div>
            )}
          </div>

          {/* Action Shortcuts during turn */}
          <div className="flex items-center gap-2">
            {/* Quick Skip AI Speech button: User can bypass waiting and speak immediately */}
            {turn === 'AI_SPEAKING' && (
              <button
                type="button"
                onClick={forceStartUserMic}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md transition-all active:scale-95"
                title="Skip AI audio and open microphone immediately"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Speak Now 🎙️</span>
              </button>
            )}

            {/* Repeat Question Button */}
            {currentPrompt && isActiveSession && (
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
        </div>

        {/* Current Active Question Spoken Aloud */}
        {currentPrompt && (
          <div className="p-3 bg-emerald-950/70 rounded-xl border border-emerald-500/30 flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <Volume2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs font-bold text-emerald-100 leading-snug">
                <span className="text-emerald-400 uppercase text-[10px] tracking-wider block font-black mb-0.5">
                  AI Question:
                </span>
                &ldquo;{currentPrompt}&rdquo;
              </div>
            </div>

            {/* In-banner Quick Speak button */}
            {turn === 'AI_SPEAKING' && (
              <button
                type="button"
                onClick={forceStartUserMic}
                className="flex-shrink-0 text-[11px] font-bold px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30"
              >
                Open Mic ➔
              </button>
            )}
          </div>
        )}

        {/* Live Audio Transcript / Feedback */}
        <div className="min-w-0">
          {interimTranscript ? (
            <p className="text-xs font-bold text-amber-300 italic truncate flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse flex-shrink-0" />
              <span>Hearing: &ldquo;{interimTranscript}...&rdquo;</span>
            </p>
          ) : lastFeedback ? (
            <p className="text-xs font-bold text-emerald-300 flex items-center gap-1 truncate">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>{lastFeedback}</span>
            </p>
          ) : (
            <p className="text-xs text-emerald-200/70 truncate">
              {isActiveSession
                ? turn === 'AI_SPEAKING'
                  ? 'Listening for AI question to end... Mic activates automatically or click "Speak Now 🎙️"'
                  : 'Microphone is active! Speak your answer clearly...'
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
            voiceStageRef.current = 'ASK_CUSTOMER_NAME';
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
            voiceStageRef.current = 'ASK_ITEM_NAME';
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
            voiceStageRef.current = 'ASK_QUANTITY';
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
            voiceStageRef.current = 'ASK_MRP';
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
            voiceStageRef.current = 'ASK_DISCOUNT';
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
            voiceStageRef.current = 'ASK_CONFIRM_PROCESS';
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
              <strong>Instant Mic Activation:</strong> If you don&apos;t want to wait for AI audio to speak, simply tap <em>&ldquo;Speak Now 🎙️&rdquo;</em> or mute <em>&ldquo;AI Voice 🔊&rdquo;</em> to open the mic instantly!
            </li>
            <li>
              <strong>Indian Names Support:</strong> Names like <em>&ldquo;Mani Building&rdquo;</em> (even if speech recognition transcribes as <em>&ldquo;money building&rdquo;</em>) are automatically mapped to <strong>Mani Building</strong>.
            </li>
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
