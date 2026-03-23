import React, { useState } from 'react';
import { X, Wand2, Check, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { generateFashionImages } from '../services/geminiService';
import { ReferenceImage } from '../types';

interface LogoRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetImage: string; // base64
  referenceImage: string | null; // base64
  onSave: (newImageData: string) => void;
}

const LogoRepairModal: React.FC<LogoRepairModalProps> = ({ isOpen, onClose, targetImage, referenceImage, onSave }) => {
  const [instruction, setInstruction] = useState("Fix the logo and text on the clothing to be clear, sharp, and correctly spelled. Maintain the original font style and design.");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRepair = async () => {
    setIsGenerating(true);
    setError(null);
    try {
        const refs: ReferenceImage[] = [];
        
        // Target image is the primary reference (Image 1)
        refs.push({
            id: 'target',
            base64: targetImage.includes(',') ? targetImage.split(',')[1] : targetImage,
            url: '',
            mimeType: 'image/png'
        });

        // Optional original reference (Image 2)
        if (referenceImage) {
             refs.push({
                id: 'ref',
                base64: referenceImage.includes(',') ? referenceImage.split(',')[1] : referenceImage,
                url: '',
                mimeType: 'image/png'
            });
        }

        const prompt = `Task: Image Editing / Restoration.
        [Image 1] is the target image to be fixed.
        ${referenceImage ? '[Image 2] is the original reference for the logo/text design.' : ''}
        
        User Instruction: ${instruction}
        
        Strictly maintain the subject's pose, face, body, and the overall lighting of [Image 1]. 
        Only modify the specific area of logos, text, or graphics on the clothing to improve clarity and fidelity.
        High quality, 8k, sharp focus.`;

        // Force Pro model for high fidelity text rendering
        const results = await generateFashionImages(prompt, refs, 1, '1K', undefined, undefined, true);
        
        if (results && results.length > 0) {
            setResultImage(results[0]);
        } else {
            setError("No image generated.");
        }

    } catch (err: any) {
        setError(err.message || "Failed to repair image.");
    } finally {
        setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-[#1e293b] w-full max-w-4xl rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                    <Wand2 className="text-purple-400" /> Logo & Text Repair
                </h3>
                <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full transition-colors">
                    <X size={20} className="text-slate-400" />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
                <div className="flex flex-col md:flex-row gap-6 items-stretch justify-center h-full min-h-[400px]">
                    {/* Source */}
                    <div className="flex-1 flex flex-col gap-2">
                         <span className="text-xs font-bold text-slate-500 uppercase">Original</span>
                         <div className="relative flex-1 bg-slate-900 rounded-xl border border-slate-700 overflow-hidden flex items-center justify-center">
                             <img src={targetImage} alt="Target" className="max-h-full max-w-full object-contain" />
                         </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center justify-center text-slate-600">
                        <ArrowRight size={32} />
                    </div>

                    {/* Result */}
                    <div className="flex-1 flex flex-col gap-2">
                         <span className="text-xs font-bold text-slate-500 uppercase">Repaired Result</span>
                         <div className="relative flex-1 bg-slate-900 rounded-xl border border-slate-700 overflow-hidden flex items-center justify-center">
                             {isGenerating ? (
                                 <div className="flex flex-col items-center gap-3 text-purple-400">
                                     <Loader2 size={40} className="animate-spin" />
                                     <span className="text-sm font-medium">Repairing...</span>
                                 </div>
                             ) : resultImage ? (
                                 <img src={resultImage} alt="Result" className="max-h-full max-w-full object-contain" />
                             ) : (
                                 <div className="text-slate-600 text-sm text-center px-4">
                                     Click "Repair" to generate a fixed version.
                                 </div>
                             )}
                         </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="mt-6 space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-400 mb-2 block">Repair Instruction</label>
                        <div className="flex gap-2">
                            <input 
                                type="text"
                                value={instruction}
                                onChange={(e) => setInstruction(e.target.value)}
                                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm focus:border-blue-500 outline-none"
                            />
                            <button
                                onClick={handleRepair}
                                disabled={isGenerating}
                                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                                Repair
                            </button>
                        </div>
                    </div>
                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-sm text-red-300 flex items-start gap-2">
                            <AlertCircle size={16} className="mt-0.5" />
                            {error}
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-end gap-3">
                <button 
                    onClick={onClose}
                    className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                >
                    Cancel
                </button>
                <button 
                    onClick={() => resultImage && onSave(resultImage)}
                    disabled={!resultImage}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                >
                    <Check size={18} />
                    Apply Result
                </button>
            </div>
        </div>
    </div>
  );
};

export default LogoRepairModal;