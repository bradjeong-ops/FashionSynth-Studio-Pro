import React, { useState, useEffect } from 'react';
import { validateApiKey } from '../services/geminiService';

interface GuestLoginModalProps {
  onLogin: (pin: string) => void;
  onClose?: () => void;
  mode?: 'pin' | 'key' | 'both';
  initialPin?: string;
}

const KeyIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
  </svg>
);

const UserIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

const ArrowRightIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

const DiceIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
  </svg>
);

const XMarkIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const LoadingIcon = ({ className = "w-5 h-5" }) => (
  <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export default function GuestLoginModal({ onLogin, onClose, mode = 'both', initialPin = '' }: GuestLoginModalProps) {
  const [pin, setPin] = useState(initialPin);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem('custom_gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isPinMode = mode === 'pin' || mode === 'both';
    const isKeyMode = mode === 'key' || mode === 'both';

    if (isPinMode && (pin.length !== 4 || !/^\d+$/.test(pin))) {
      setError('Please enter a valid 4-digit PIN.');
      return;
    }
    
    const trimmedKey = apiKey.trim();
    if (isKeyMode && !trimmedKey) {
      setError('Please enter your Gemini API Key.');
      return;
    }

    if (isKeyMode && trimmedKey) {
      setIsValidating(true);
      setError('');
      console.log("[Modal] Validating API Key...");
      const isValid = await validateApiKey(trimmedKey);
      console.log(`[Modal] Validation result: ${isValid}`);
      setIsValidating(false);
      
      if (!isValid) {
        setError('Invalid API Key. Please check and try again.');
        return;
      }
      
      localStorage.setItem('custom_gemini_api_key', trimmedKey);
    }
    
    onLogin(pin);
  };

  const generateRandomPin = () => {
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
    setPin(randomPin);
    setError('');
  };

  const showPin = mode === 'pin' || mode === 'both';
  const showKey = mode === 'key' || mode === 'both';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative bg-[#111827] border border-white/10 p-8 rounded-[32px] shadow-2xl w-full max-w-md flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
        
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}

        <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mb-6 border border-indigo-500/30">
          {mode === 'pin' ? <UserIcon className="w-8 h-8 text-indigo-400" /> : <KeyIcon className="w-8 h-8 text-indigo-400" />}
        </div>
        
        <h2 className="text-2xl font-black text-white mb-2 tracking-tight">
          {mode === 'pin' ? 'CHANGE GUEST PIN' : mode === 'key' ? 'UPDATE API KEY' : 'GUEST ACCESS'}
        </h2>
        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          {mode === 'pin' ? 'Update your 4-digit guest PIN.' : mode === 'key' ? 'Update your Gemini API Key for Pro models.' : 'Enter a 4-digit PIN and your Gemini API Key to access your workspace.'}
        </p>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          {showPin && (
            <div className="w-full text-left">
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Guest PIN (4 digits)</label>
              <div className="relative flex items-center gap-2">
                <input
                  type="text"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setPin(val);
                    setError('');
                  }}
                  placeholder="0000"
                  className="w-full bg-black/50 border border-white/10 rounded-2xl px-6 py-4 text-center text-4xl font-black text-white tracking-[1em] focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-white/10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={generateRandomPin}
                  className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-colors text-indigo-400 hover:text-indigo-300"
                  title="Generate Random PIN"
                >
                  <DiceIcon className="w-8 h-8" />
                </button>
              </div>
            </div>
          )}

          {showKey && (
            <div className="w-full text-left mt-2">
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">GEMINI API KEY</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError('');
                }}
                placeholder="AIzaSy..."
                className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-sm font-mono text-white focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-white/20"
              />
            </div>
          )}
          
          {error && (
            <p className="text-red-400 text-xs font-bold animate-in fade-in">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={(showPin && pin.length !== 4) || (showKey && !apiKey.trim()) || isValidating}
            className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-white/30 text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 group shadow-lg shadow-indigo-900/20"
          >
            {isValidating ? (
              <>
                <LoadingIcon />
                VALIDATING KEY...
              </>
            ) : (
              <>
                {mode === 'pin' ? 'UPDATE PIN' : mode === 'key' ? 'UPDATE KEY' : 'ACCESS WORKSPACE'}
                <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
