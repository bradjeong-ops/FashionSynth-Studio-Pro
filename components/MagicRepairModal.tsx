
import React, { useState, useRef } from 'react';
import { X, Wand2, Check, AlertCircle, Loader2, ArrowRight, Smile, Hand, Sparkles, Type, Upload, Image as ImageIcon } from 'lucide-react';
import { generateFashionImages } from '../services/geminiService';
import { ReferenceImage, ImageResolution } from '../types';

interface MagicRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetImage: string; // base64 or blob url
  currentResolution: ImageResolution;
  onSave: (newImageData: string) => void;
}

type RepairMode = 'FACE' | 'HANDS' | 'DENOISE' | 'LOGO' | 'CUSTOM';

const MagicRepairModal: React.FC<MagicRepairModalProps> = ({ isOpen, onClose, targetImage, currentResolution, onSave }) => {
  const [activeMode, setActiveMode] = useState<RepairMode>('LOGO'); // 로고 모드 기본
  const [customInstruction, setCustomInstruction] = useState("");
  const [resultImage, setResultImage] = useState<string | null>(null);
  
  // [추가] 레퍼런스 이미지 상태
  const [refImage, setRefImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // [추가] 레퍼런스 이미지 업로드 핸들러
  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setRefImage(reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const getPromptForMode = (mode: RepairMode) => {
      switch(mode) {
          case 'FACE':
              return "Fix the face details. Restore eyes, nose, and mouth symmetry. Ensure skin texture is realistic. Do NOT change the outfit.";
          case 'HANDS':
              return "Fix the hands and fingers. Ensure correct number of fingers (5 digits). Fix anatomical structure. Do NOT change the outfit.";
          case 'DENOISE':
              return "Denoise and smooth the texture. Remove grain and artifacts. Sharpen edges. Do NOT change any details.";
          case 'LOGO':
              // 레퍼런스 이미지가 있을 때와 없을 때 프롬프트 분기
              if (refImage) {
                  return "REPLACE the damaged logo on [Image 1] with the reference logo provided in [Image 2]. Maintain the perspective and fold of the fabric, but use the exact design/spelling from [Image 2].";
              }
              return "Fix the logo text to be sharp and legible. Correct spelling errors. Maintain the original font style but make it high-definition.";
          default:
              return customInstruction;
      }
  };

  const handleRepair = async () => {
    setIsGenerating(true);
    setError(null);
    try {
        // 1. 타겟 이미지 (Base64 변환)
        let finalTargetBase64 = '';
        if (targetImage.startsWith('blob:')) {
            const response = await fetch(targetImage);
            const blob = await response.blob();
            finalTargetBase64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const res = reader.result as string;
                    resolve(res.split(',')[1]);
                };
                reader.readAsDataURL(blob);
            });
        } else {
            finalTargetBase64 = targetImage.includes(',') ? targetImage.split(',')[1] : targetImage;
        }

        const refs: ReferenceImage[] = [];
        
        // Image 1: Target (수정할 대상)
        refs.push({
            id: 'target',
            base64: finalTargetBase64,
            url: '',
            mimeType: 'image/png'
        });

        // Image 2: Reference (로고 원본 등 - 있으면 추가)
        if (refImage) {
            const refBase64 = refImage.includes(',') ? refImage.split(',')[1] : refImage;
            refs.push({
                id: 'reference',
                base64: refBase64,
                url: '',
                mimeType: 'image/png'
            });
        }

        const instruction = getPromptForMode(activeMode);
        
        // 프롬프트 구성
        let prompt = `Task: Precision In-painting & Image Editing.
        Target Image: [Image 1]
        ${refImage ? 'Reference Guide: [Image 2] (Use this as the GROUND TRUTH for the repair)' : ''}
        Resolution Target: ${currentResolution}.

        USER INSTRUCTION: "${instruction}"

        # CRITICAL RULES:
        1. Only modify the specific area mentioned in the USER INSTRUCTION.
        2. COPY-PASTE the rest of the image pixels exactly as they are.
        `;
        
        // 레퍼런스가 있을 경우 추가 지침
        if (refImage) {
            prompt += `\n3. [REFERENCE MAPPING]: You MUST use the visual details from [Image 2] (Reference) and apply them to [Image 1] (Target). Adapt the reference to the lighting and folds of the clothing in [Image 1].`;
        }

        const results = await generateFashionImages(prompt, refs, 1, currentResolution, undefined, undefined, true);
        
        if (results && results.length > 0) {
            setResultImage(results[0]);
        } else {
            setError("No image generated.");
        }

    } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to repair image.");
    } finally {
        setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-[#1e293b] w-full max-w-5xl rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                    <Wand2 className="text-blue-400" /> Magic Detail Fixer ({currentResolution})
                </h3>
                <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full transition-colors">
                    <X size={20} className="text-slate-400" />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                <div className="flex flex-col md:flex-row gap-6 items-stretch justify-center h-[400px]">
                    {/* Source Image */}
                    <div className="flex-1 flex flex-col gap-2">
                         <span className="text-xs font-bold text-slate-500 uppercase">Original Source</span>
                         <div className="relative flex-1 bg-slate-900 rounded-xl border border-slate-700 overflow-hidden flex items-center justify-center group">
                             <img src={targetImage} alt="Target" className="max-h-full max-w-full object-contain" />
                         </div>
                    </div>

                    <div className="flex items-center justify-center text-slate-600"><ArrowRight size={32} /></div>

                    {/* Result Image */}
                    <div className="flex-1 flex flex-col gap-2">
                         <span className="text-xs font-bold text-slate-500 uppercase">Fixed Result</span>
                         <div className="relative flex-1 bg-slate-900 rounded-xl border border-slate-700 overflow-hidden flex items-center justify-center">
                             {isGenerating ? (
                                 <div className="flex flex-col items-center gap-3 text-blue-400">
                                     <Loader2 size={40} className="animate-spin" />
                                     <span className="text-sm font-medium animate-pulse">Fixing in {currentResolution}...</span>
                                 </div>
                             ) : resultImage ? (
                                 <img src={resultImage} alt="Result" className="max-h-full max-w-full object-contain" />
                             ) : (
                                 <div className="text-slate-600 text-sm text-center px-4">Result will appear here</div>
                             )}
                         </div>
                    </div>
                </div>

                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-400 mb-2 block">Repair Mode</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { id: 'LOGO', label: 'Fix Logo (With Ref)', icon: Type },
                                    { id: 'DENOISE', label: 'Denoise / Clean', icon: Sparkles },
                                    { id: 'FACE', label: 'Fix Face', icon: Smile },
                                    { id: 'HANDS', label: 'Fix Hands', icon: Hand },
                                    { id: 'CUSTOM', label: 'Custom', icon: Wand2 },
                                ].map((mode) => (
                                    <button key={mode.id} onClick={() => setActiveMode(mode.id as RepairMode)} className={`px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-medium transition-all ${activeMode === mode.id ? 'bg-blue-600 text-white shadow-lg ring-1 ring-blue-400' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}>
                                        <mode.icon size={14} /> {mode.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* [추가] 레퍼런스 이미지 업로드 영역 */}
                        <div className="flex flex-col items-end">
                            <label className="text-xs font-semibold text-slate-400 mb-2 block">Optional Reference</label>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-32 h-20 bg-slate-800 border border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-slate-700 transition-all relative overflow-hidden"
                                title="Upload Logo/Reference Image"
                            >
                                {refImage ? (
                                    <>
                                        <img src={refImage} className="w-full h-full object-cover opacity-60" alt="Ref" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="bg-black/50 text-white text-[10px] px-2 py-1 rounded backdrop-blur">Change</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={20} className="text-slate-500 mb-1" />
                                        <span className="text-[9px] text-slate-500">Upload Ref</span>
                                    </>
                                )}
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleRefUpload} className="hidden" accept="image/*" />
                            {refImage && <button onClick={() => setRefImage(null)} className="text-[10px] text-red-400 mt-1 hover:underline">Remove Ref</button>}
                        </div>
                    </div>

                    {/* Custom Input */}
                    {activeMode === 'CUSTOM' && (
                        <input type="text" placeholder="Describe what to fix..." value={customInstruction} onChange={(e) => setCustomInstruction(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm focus:border-blue-500 outline-none mb-4 animate-in fade-in" />
                    )}
                    
                    {/* 안내 문구 */}
                    {activeMode === 'LOGO' && !refImage && (
                        <p className="text-[11px] text-amber-500 mb-4 flex items-center gap-1">
                            <AlertCircle size={12} /> Tip: Upload the original logo image on the right for accurate repair.
                        </p>
                    )}

                    <div className="flex justify-end gap-3 items-center mt-2 border-t border-slate-700 pt-4">
                         {error && <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12}/> {error}</span>}
                         <button onClick={handleRepair} disabled={isGenerating || (activeMode === 'CUSTOM' && !customInstruction)} className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                            {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />} Start Magic Fix
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-end gap-3">
                <button onClick={onClose} className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                <button onClick={() => resultImage && onSave(resultImage)} disabled={!resultImage} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"><Check size={18} /> Apply & Save</button>
            </div>
        </div>
    </div>
  );
};

export default MagicRepairModal;
