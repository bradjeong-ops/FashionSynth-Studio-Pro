
import React, { useState, useEffect } from 'react';
import { User, Shirt, Image as ImageIcon, Settings, LogIn, RefreshCw, Loader2, Key, X } from 'lucide-react';
import ModelGenerator from './components/ModelGenerator';
import OutfitTryOn from './components/OutfitTryOn';
import Gallery from './components/Gallery';
import { ModelGenerationStep } from './types';
import IntroScreen from './components/IntroScreen';
import GuestLoginModal from './components/GuestLoginModal';

export interface ModelTransferPayload {
  image: string; // base64
  targetStep: ModelGenerationStep;
}

// Improved Robust URL to Base64 using fetch (better for CORS with Firebase)
const urlToBase64 = async (url: string): Promise<string> => {
  if (url.startsWith('data:')) return url;
  try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
      });
  } catch (error) {
      console.error("Base64 conversion failed via fetch, trying canvas fallback", error);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas context failure')); return; }
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (err) => reject(new Error('Canvas conversion failed'));
      });
  }
};

const App: React.FC = () => {
  const [showIntro, setShowIntro] = useState(true);
  const [activeTab, setActiveTab] = useState<'MODEL_GEN' | 'OUTFIT_TRYON' | 'GALLERY'>('MODEL_GEN');
  const [isProcessingTransfer, setIsProcessingTransfer] = useState(false);
  
  // State for Outfit Try-on Transfer
  const [transferImage, setTransferImage] = useState<string | null>(null);
  
  // State for Model Generator Transfer
  const [modelTransferPayload, setModelTransferPayload] = useState<ModelTransferPayload | null>(null);
  
  const [userId, setUserId] = useState<string>('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [modalMode, setModalMode] = useState<'pin' | 'key' | 'both'>('both');

  useEffect(() => {
    const savedPin = localStorage.getItem('guestPin');
    if (savedPin) {
      setUserId(savedPin);
    } else {
      setShowLoginModal(true);
    }
  }, []);

  useEffect(() => {
    const checkKey = async () => {
      try {
        const aistudio = (window as any).aistudio;
        const selected = await aistudio?.hasSelectedApiKey();
        const customKey = localStorage.getItem('custom_gemini_api_key');
        
        // Also check for environment variables if available (Vite style)
        const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY;
        
        setHasApiKey(selected || !!customKey || !!envKey);
      } catch (e) {
        const customKey = localStorage.getItem('custom_gemini_api_key');
        const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY;
        setHasApiKey(!!customKey || !!envKey);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    if (!isCheckingKey && !hasApiKey) {
      setModalMode('both');
      setShowLoginModal(true);
    }
  }, [isCheckingKey, hasApiKey]);

  const handleLogin = (pin: string) => {
    localStorage.setItem('guestPin', pin);
    setUserId(pin);
    setShowLoginModal(false);
    
    const customKey = localStorage.getItem('custom_gemini_api_key');
    if (customKey) {
      setHasApiKey(true);
    }
  };

  const handleOpenKeySelector = async () => {
    const customKey = localStorage.getItem('custom_gemini_api_key');
    if (customKey) {
      setModalMode('key');
      setShowLoginModal(true);
      return;
    }

    try {
      const aistudio = (window as any).aistudio;
      if (aistudio?.openSelectKey) {
        await aistudio.openSelectKey();
        setHasApiKey(true);
      } else {
        throw new Error("AI Studio API not available");
      }
    } catch (e) {
      console.error("AI Studio key selection failed, showing manual input modal", e);
      setModalMode('key');
      setShowLoginModal(true);
    }
  };

  const handleGuestBadgeClick = () => {
    setModalMode('pin');
    setShowLoginModal(true);
  };

  const handleTransferImage = (base64Data: string) => {
    setTransferImage(base64Data);
    setActiveTab('OUTFIT_TRYON');
  };

  // Central Handler for "Use Image" from Gallery
  const handleUseGalleryImage = async (data: string, destination: 'TRY_ON' | 'MODEL_MV' | 'MODEL_POSE') => {
      setIsProcessingTransfer(true);
      try {
          // In local mode, data is already base64, but we keep the check just in case
          const base64Data = data.startsWith('http') ? await urlToBase64(data) : data;

          if (destination === 'TRY_ON') {
              setTransferImage(base64Data);
              setActiveTab('OUTFIT_TRYON');
          } else if (destination === 'MODEL_MV') {
              setModelTransferPayload({
                  image: base64Data,
                  targetStep: ModelGenerationStep.STEP2_MULTIVIEW
              });
              setActiveTab('MODEL_GEN');
          } else if (destination === 'MODEL_POSE') {
              setModelTransferPayload({
                  image: base64Data,
                  targetStep: ModelGenerationStep.STEP3_POSE
              });
              setActiveTab('MODEL_GEN');
          }
      } catch (error) {
          console.error("Image transfer failed:", error);
          alert("이미지를 불러오는데 실패했습니다.");
      } finally {
          setIsProcessingTransfer(false);
      }
  };

  return (
    <div className="relative w-full h-screen bg-[#0f172a] overflow-hidden">
      {/* Intro Overlay */}
      {showIntro && <IntroScreen onComplete={() => setShowIntro(false)} />}

      {/* Guest Login Modal */}
      {showLoginModal && (
        <GuestLoginModal 
          onLogin={handleLogin} 
          onClose={userId ? () => setShowLoginModal(false) : undefined}
          mode={modalMode}
          initialPin={userId}
        />
      )}
      
      {/* Main App content - Always rendered but content depends on userId */}
      <div className={`flex h-full w-full flex-col transition-opacity duration-1000 ${showIntro ? 'opacity-0' : 'opacity-100'}`}>
         {/* Header with Tabs */}
         <div className="h-14 bg-[#1e293b]/90 backdrop-blur-md border-b border-slate-700 flex items-center px-6 justify-between z-50 shrink-0 relative">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-900/50">FS</div>
              <h1 className="font-bold text-lg text-white">FashionSynth Studio</h1>
           </div>

           {/* Centered Tabs */}
           <div className="absolute left-1/2 -translate-x-1/2 flex bg-slate-900/60 p-1.5 rounded-xl border border-slate-700/50 backdrop-blur-sm shadow-inner">
              <button
                  onClick={() => setActiveTab('MODEL_GEN')}
                  className={`px-5 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all duration-200 ${activeTab === 'MODEL_GEN' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
              >
                  <User size={16} /> 모델생성
              </button>
              <button
                  onClick={() => setActiveTab('OUTFIT_TRYON')}
                  className={`px-5 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all duration-200 ${activeTab === 'OUTFIT_TRYON' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
              >
                  <Shirt size={16} /> 의상착용
              </button>
              <button
                  onClick={() => setActiveTab('GALLERY')}
                  className={`px-5 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all duration-200 ${activeTab === 'GALLERY' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
              >
                  <ImageIcon size={16} /> 갤러리
              </button>
           </div>

           {/* Right Actions */}
           <div className="flex items-center gap-4">
              {/* API Key Button */}
              <div 
                onClick={handleOpenKeySelector}
                className={`text-[10px] font-black flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                  hasApiKey 
                    ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20' 
                    : 'text-slate-400 bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                title={hasApiKey ? "Change API Key" : "Connect API Key for Pro Models"}
              >
                {hasApiKey ? (
                  <><Key size={14} className="text-indigo-400" /> PRO MODEL ACTIVE</>
                ) : (
                  <><Key size={14} className="text-slate-400" /> CONNECT API KEY</>
                )}
              </div>

              {/* Guest Badge */}
              <div 
                onClick={handleGuestBadgeClick} 
                className="text-[10px] font-black text-slate-400 flex items-center gap-2 bg-white/5 px-4 py-2 rounded-lg border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
                title="Click to change Guest PIN"
              >
                  <User size={14} className="text-indigo-400" />
                  <span>GUEST: {userId || '....'}</span>
              </div>
           </div>
         </div>

         {/* Content */}
         <div className="flex-1 overflow-hidden relative">
             {isProcessingTransfer && (
                 <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                     <Loader2 className="animate-spin text-blue-500" size={48} />
                     <p className="text-lg font-bold text-white">이미지 변환 중...</p>
                 </div>
             )}
             
             {userId ? (
               <>
                 <div className={`w-full h-full absolute inset-0 ${activeTab === 'MODEL_GEN' ? 'block z-10' : 'hidden z-0'}`}>
                    <ModelGenerator 
                      onSelectAsBaseModel={handleTransferImage} 
                      userId={userId} 
                      transferPayload={modelTransferPayload}
                      onTransferConsumed={() => setModelTransferPayload(null)}
                      onOpenKeySelector={handleOpenKeySelector}
                    />
                 </div>
                 <div className={`w-full h-full absolute inset-0 ${activeTab === 'OUTFIT_TRYON' ? 'block z-10' : 'hidden z-0'}`}>
                    <OutfitTryOn transferImage={transferImage} userId={userId} onOpenKeySelector={handleOpenKeySelector} />
                 </div>
                 {activeTab === 'GALLERY' && (
                     <div className="w-full h-full absolute inset-0 z-10">
                        <Gallery userId={userId} isActive={true} onUseImage={handleUseGalleryImage} />
                     </div>
                 )}
               </>
             ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#0f172a]">
                    <Loader2 size={40} className="animate-spin text-blue-500" />
                </div>
             )}
         </div>
      </div>
    </div>
  );
};
export default App;
