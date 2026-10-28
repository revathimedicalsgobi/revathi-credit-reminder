'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Mic,
  MicOff,
  Send,
  X,
  Bot,
  User,
  Key,
  ExternalLink,
  Volume2,
  VolumeX,
  Receipt,
  Share2,
  TrendingUp,
  CreditCard,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { formatINR } from '@/lib/calculations';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  actionResult?: any;
  timestamp: Date;
}

export function AIAssistantModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<'ta-IN' | 'en-IN'>('ta-IN');
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Load custom Gemini API key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('revathi_gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }

    // Set welcome message in Tamil
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        text: `வணக்கம்! நான் உங்கள் **Revathi Medicals AI அசிஸ்டன்ட்** 🤖\n\nநீங்கள் என்னிடம் **தமிழிலோ அல்லது ஆங்கிலத்திலோ** வாய்ஸ் அல்லது டெக்ஸ்ட் மூலம் பில் போடலாம், கஸ்டமர் பாக்கி செக் பண்ணலாம்!`,
        timestamp: new Date(),
      },
    ]);

    const handleOpenEvent = () => {
      setIsOpen(true);
      setIsMinimized(false);
    };
    window.addEventListener('open-ai-assistant', handleOpenEvent);
    return () => window.removeEventListener('open-ai-assistant', handleOpenEvent);
  }, []);

  // Scroll to bottom on new message
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized]);

  // Save API Key
  const handleSaveApiKey = (key: string) => {
    const trimmed = key.trim();
    setApiKey(trimmed);
    if (trimmed) {
      localStorage.setItem('revathi_gemini_api_key', trimmed);
    } else {
      localStorage.removeItem('revathi_gemini_api_key');
    }
    setShowKeyModal(false);
  };

  // Text to Speech
  const speakText = (text: string) => {
    if (!ttsEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      // Clean markdown stars and bullets
      const cleanText = text.replace(/[*#•_`]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = voiceLanguage;
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('TTS error:', e);
    }
  };

  // Web Speech Recognition (Microphone)
  const toggleListening = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('உங்கள் பிரவுசரில் Speech Recognition வசதி இல்லை. தயவுசெய்து Google Chrome அல்லது Microsoft Edge பயன்படுத்தவும்.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = voiceLanguage;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputText(transcript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Error starting speech recognition:', err);
      setIsListening(false);
    }
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          customApiKey: apiKey || undefined,
        }),
      });

      const data = await res.json();

      if (data.reply) {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: data.reply,
          actionResult: data.actionResult,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMessage]);
        speakText(data.reply);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: 'மன்னிக்கவும், தகவல் பெறுவதில் சிறு சிக்கல் ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.',
            timestamp: new Date(),
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: `பிழை: ${err.message || 'Server error'}. மீண்டும் முயற்சிக்கவும்.`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Floating Action Trigger Button (Bottom Right) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9999] flex items-center gap-2 sm:gap-2.5 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white rounded-full shadow-2xl hover:shadow-emerald-500/40 hover:scale-105 active:scale-95 transition-all duration-300 no-print group border-2 border-white/30"
          aria-label="Open AI Assistant"
        >
          <div className="relative">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[10px] sm:text-xs font-black tracking-wide uppercase text-emerald-100 flex items-center gap-1">
              Revathi AI <span className="bg-white/20 text-[9px] sm:text-[10px] px-1 rounded font-mono">FREE</span>
            </span>
            <span className="text-xs sm:text-sm font-bold text-white">வாய்ஸ் அசிஸ்டன்ட் 🎙️</span>
          </div>
        </button>
      )}

      {/* Main AI Chat Modal */}
      {isOpen && (
        <div
          className={`fixed z-[9999] transition-all duration-300 no-print flex flex-col bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden ${
            isMinimized
              ? 'bottom-4 right-4 sm:bottom-6 sm:right-6 w-72 sm:w-80 h-14 sm:h-16'
              : 'bottom-2 right-2 sm:bottom-6 sm:right-6 w-[calc(100vw-1rem)] sm:w-[440px] h-[85vh] sm:h-[600px] max-h-[92vh]'
          }`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white px-4 py-3.5 flex items-center justify-between border-b border-emerald-800/40">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-white truncate">ரேவதி AI அசிஸ்டன்ட்</h3>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-medium">
                    {apiKey ? 'Gemini AI' : 'Smart Engine'}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-300/80 truncate">
                  வாய்ஸ் & தமிழ் பில்லிங் உதவியாளர்
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-slate-300">
              {/* API Key Modal Button */}
              <button
                onClick={() => setShowKeyModal(!showKeyModal)}
                title="Google Gemini Free API Key"
                className={`p-1.5 rounded-lg transition-colors ${
                  apiKey ? 'text-emerald-400 hover:bg-emerald-900/50' : 'text-amber-400 hover:bg-amber-900/50'
                }`}
              >
                <Key className="w-4 h-4" />
              </button>

              {/* TTS Toggle */}
              <button
                onClick={() => setTtsEnabled(!ttsEnabled)}
                title={ttsEnabled ? 'Mute Voice' : 'Enable Voice Reply'}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-300 hover:text-white"
              >
                {ttsEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
              </button>

              {/* Minimize */}
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-300 hover:text-white"
              >
                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>

              {/* Close */}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body when not minimized */}
          {!isMinimized && (
            <>
              {/* API Key Config Dropdown (Collapsible) */}
              {showKeyModal && (
                <div className="bg-slate-50 border-b border-slate-200 p-3 text-xs animate-in slide-in-from-top duration-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <Key className="w-3.5 h-3.5 text-indigo-600" /> Google Gemini API Key (இலவசம்)
                    </span>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline flex items-center gap-0.5 text-[11px]"
                    >
                      Get Free Key <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-slate-500 text-[11px] mb-2">
                    Google AI Studio-வில் 1 நிமிடத்தில் இலவச API Key உருவாக்கலாம். இது இல்லாமல் இயங்கினாலும், API Key வைத்தால் தமிழ் உரையாடல் மேலும் துல்லியமாக இருக்கும்.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="AIzaSy..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                    <button
                      onClick={() => handleSaveApiKey(apiKey)}
                      className="px-3 py-1.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'model' && (
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5 border border-emerald-200">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-emerald-600 text-white rounded-tr-xs'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                      }`}
                    >
                      {/* Message Text */}
                      <div className="whitespace-pre-line text-[13px]">{msg.text}</div>

                      {/* Rich Action Result Card (if any) */}
                      {msg.actionResult && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100">
                          {/* 1. Bill Created Card */}
                          {msg.actionResult.type === 'BILL_CREATED' && (
                            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5 text-xs space-y-2">
                              <div className="flex items-center justify-between text-emerald-800 font-bold">
                                <span className="flex items-center gap-1">
                                  <Receipt className="w-3.5 h-3.5 text-emerald-600" /> புதிய பில்
                                </span>
                                <span className="text-emerald-700 font-extrabold text-sm">
                                  {formatINR(msg.actionResult.data.amount_payable)}
                                </span>
                              </div>

                              <div className="text-slate-600 space-y-0.5 text-[11px]">
                                <div>வாடிக்கையாளர்: <strong>{msg.actionResult.data.customer_name}</strong></div>
                                <div>எண்: {msg.actionResult.data.whatsapp_number}</div>
                                {msg.actionResult.data.items?.length > 0 && (
                                  <div className="text-slate-500 truncate">
                                    பொருட்கள்: {msg.actionResult.data.items.map((i: any) => `${i.item_name} (${i.quantity})`).join(', ')}
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-2 pt-1">
                                <Link
                                  href={msg.actionResult.data.view_url}
                                  className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-center flex items-center justify-center gap-1 transition-colors"
                                >
                                  பில் பார்க்க <ArrowRight className="w-3 h-3" />
                                </Link>
                                <a
                                  href={msg.actionResult.data.whatsapp_direct_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="py-1.5 px-2.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-medium rounded-lg flex items-center gap-1 transition-colors"
                                  title="வாட்ஸ்அப்பில் அனுப்ப"
                                >
                                  <Share2 className="w-3 h-3" /> வாட்ஸ்அப்
                                </a>
                              </div>
                            </div>
                          )}

                          {/* 2. Customer Balance Card */}
                          {msg.actionResult.type === 'CUSTOMER_BALANCE' && (
                            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 text-xs space-y-1.5">
                              <div className="flex items-center justify-between font-bold text-amber-900">
                                <span>{msg.actionResult.data.primary?.customer_name}</span>
                                <span className="text-rose-600 font-extrabold text-sm">
                                  பாக்கி: {formatINR(msg.actionResult.data.primary?.total_pending || 0)}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-600">
                                வாட்ஸ்அப்: {msg.actionResult.data.primary?.whatsapp_number} | பில்கள்: {msg.actionResult.data.primary?.pending_bills_count}
                              </div>
                              <Link
                                href={`/customers/${msg.actionResult.data.primary?.customer_id}`}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:underline pt-1"
                              >
                                கஸ்டமர் கணக்கை திறக்க <ArrowRight className="w-3 h-3" />
                              </Link>
                            </div>
                          )}

                          {/* 3. Business Stats Card */}
                          {msg.actionResult.type === 'BUSINESS_STATS' && (
                            <div className="grid grid-cols-2 gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs">
                              <div className="p-1.5 bg-white rounded-lg border border-slate-100">
                                <div className="text-[10px] text-slate-500">இன்றைய விற்பனை</div>
                                <div className="font-bold text-emerald-700">{formatINR(msg.actionResult.data.today_sales)}</div>
                              </div>
                              <div className="p-1.5 bg-white rounded-lg border border-slate-100">
                                <div className="text-[10px] text-slate-500">இன்றைய வசூல்</div>
                                <div className="font-bold text-teal-700">{formatINR(msg.actionResult.data.today_collections)}</div>
                              </div>
                              <div className="p-1.5 bg-white rounded-lg border border-slate-100 col-span-2 flex justify-between items-center">
                                <span className="text-[10px] text-slate-500">மொத்த கடன் பாக்கி:</span>
                                <span className="font-extrabold text-rose-600">{formatINR(msg.actionResult.data.total_credit_outstanding)}</span>
                              </div>
                            </div>
                          )}

                          {/* 4. Payment Recorded Card */}
                          {msg.actionResult.type === 'PAYMENT_RECORDED' && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-xs flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>{formatINR(msg.actionResult.data.amount_paid)} வரவு வைக்கப்பட்டது</span>
                              </div>
                              <span className="text-slate-600 text-[11px]">
                                மீதம்: {formatINR(msg.actionResult.data.remaining_balance)}
                              </span>
                            </div>
                          )}

                          {/* 5. Reminder Sent Card */}
                          {msg.actionResult.type === 'REMINDER_SENT' && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 text-xs flex items-center gap-1.5 text-blue-800">
                              <CheckCircle2 className="w-4 h-4 text-blue-600" />
                              <span>{msg.actionResult.data.customer_name}-க்கு வாட்ஸ்அப் ரிமைண்டர் அனுப்பப்பட்டது!</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div
                        className={`text-[9px] mt-1 text-right ${
                          msg.role === 'user' ? 'text-emerald-100' : 'text-slate-400'
                        }`}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading indicator */}
                {loading && (
                  <div className="flex gap-2.5 items-center text-slate-400 text-xs pl-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>AI சிந்திக்கிறது (Processing)...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Action Prompt Chips */}
              <div className="px-3 py-1.5 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto text-xs no-scrollbar">
                <button
                  onClick={() => handleSendMessage('இன்றைய விற்பனை மற்றும் பாக்கி எவ்வளவு?')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-full font-medium whitespace-nowrap transition-colors flex items-center gap-1 flex-shrink-0"
                >
                  📊 இன்றைய நிலவரம்
                </button>
                <button
                  onClick={() => handleSendMessage('சுரேஷ் பாக்கி எவ்வளவு இருக்கு?')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-700 rounded-full font-medium whitespace-nowrap transition-colors flex items-center gap-1 flex-shrink-0"
                >
                  🔍 பாக்கி செக் பண்ணு
                </button>
                <button
                  onClick={() => setInputText('ரமேஷுக்கு Dolo 650 2 nos 60 ரூபாய் பில் போடு')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-full font-medium whitespace-nowrap transition-colors flex items-center gap-1 flex-shrink-0"
                >
                  📝 பில் போடு
                </button>
              </div>

              {/* Voice Listening Bar if listening */}
              {isListening && (
                <div className="px-3 py-2 bg-rose-50 border-t border-rose-200 flex items-center justify-between text-xs text-rose-700 animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-rose-600 rounded-full animate-ping" />
                    <span className="font-bold">நான் கேட்கிறேன் (Listening {voiceLanguage === 'ta-IN' ? 'தமிழ்' : 'English'})... பேசுங்கள்</span>
                  </div>
                  <button
                    onClick={toggleListening}
                    className="text-xs bg-rose-600 text-white px-2 py-0.5 rounded font-medium hover:bg-rose-700"
                  >
                    முடிந்தது
                  </button>
                </div>
              )}

              {/* Input Area */}
              <div className="p-3 bg-white border-t border-slate-200">
                <div className="flex items-center gap-1.5">
                  {/* Language Switcher for Voice */}
                  <button
                    onClick={() => setVoiceLanguage(voiceLanguage === 'ta-IN' ? 'en-IN' : 'ta-IN')}
                    className="px-2 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200 flex-shrink-0"
                    title="Change Voice Input Language"
                  >
                    {voiceLanguage === 'ta-IN' ? 'தமிழ்' : 'ENG'}
                  </button>

                  {/* Microphone Button */}
                  <button
                    onClick={toggleListening}
                    className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${
                      isListening
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 scale-105 animate-pulse'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                    title={isListening ? 'Stop Listening' : 'Speak in Tamil or English'}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  {/* Text Input */}
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      voiceLanguage === 'ta-IN'
                        ? 'தமிழிலோ ஆங்கிலத்திலோ தட்டச்சு செய்யவும்...'
                        : 'Type command in Tamil or English...'
                    }
                    disabled={loading}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all"
                  />

                  {/* Send Button */}
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!inputText.trim() || loading}
                    className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl shadow-sm transition-colors flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
