
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, Download, ChevronLeft, ChevronRight, Shirt, ArrowRight, Eye, Sliders, Camera, Move, Expand, ZoomIn, RotateCcw, Layers } from 'lucide-react';
import { Gender, Ethnicity, Physique, ModelViewType, ReferenceWeight } from '../types';

interface ImageModalProps {
  isOpen: boolean;
  base64Data: string | null;
  prompt: string;
  referenceImages?: string[]; // Array of base64
  timestamp?: number;
  
  // Detailed Config
  coreStats?: {
      gender: Gender;
      ethnicity: Ethnicity;
      physique: Physique;
      height: number;
  };
  viewType?: ModelViewType;
  faceDetail?: string;
  hairDetail?: string;
  bodyDetail?: string; // New: Body Details
  poseDetail?: string;
  age?: string;
  faceReferenceWeight?: ReferenceWeight;

  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  
  // New Action Handlers
  onUseAsBase?: () => void;
  onNextStep?: () => void;
  onSkipToStep3?: () => void; // New: Direct jump to Step 3
  onToFullBody?: () => void; // New: Expand to Full Body
  showNextStep?: boolean;
}

const ImageModal: React.FC<ImageModalProps> = ({ 
  isOpen, 
  base64Data, 
  prompt, 
  referenceImages,
  timestamp,
  coreStats,
  viewType,
  faceDetail,
  hairDetail,
  bodyDetail,
  poseDetail,
  age,
  faceReferenceWeight,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onUseAsBase,
  onNextStep,
  onSkipToStep3,
  onToFullBody,
  showNextStep = true
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  if (!isOpen || !base64Data) return null;

  // Reset zoom and comparison when image changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setShowReference(false);
  }, [base64Data]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') onPrev();
        if (e.key === 'ArrowRight') onNext();
        if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPrev, onNext, onClose]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(scale * delta, 1), 10);
    
    if (newScale <= 1.05) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(newScale);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition(prev => ({
        x: prev.x + e.movementX / scale,
        y: prev.y + e.movementY / scale
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = base64Data;
    link.download = `generated-model-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      
      {/* Main Container */}
      <div 
        className="relative w-full max-w-6xl flex flex-col md:flex-row gap-6 max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Navigation - Left */}
        <button 
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 md:-translate-x-16 p-3 rounded-full bg-white/10 backdrop-blur text-white transition-all z-20 hover:bg-white/20 hover:scale-110`}
        >
            <ChevronLeft size={32} />
        </button>

        {/* Image Display */}
        <div 
            className="flex-1 flex items-center justify-center bg-[#0f0f12] rounded-xl overflow-hidden shadow-2xl border border-[#333] relative group select-none"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
           <img 
             ref={imgRef}
             src={showReference && referenceImages && referenceImages.length > 0 ? referenceImages[0] : base64Data} 
             alt="Full View" 
             className={`max-h-[85vh] w-auto object-contain ${isDragging ? '' : 'transition-transform duration-150 ease-out'} ${scale > 1 ? 'cursor-move' : 'cursor-default'}`}
             style={{ 
               transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
               transformOrigin: 'center'
             }}
             draggable={false}
           />

           {/* Zoom Indicator */}
           {scale > 1 && (
             <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-2 z-30">
               <ZoomIn size={14} />
               {Math.round(scale * 100)}%
               <button 
                 onClick={resetZoom}
                 className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"
                 title="Reset Zoom"
               >
                 <RotateCcw size={14} />
               </button>
             </div>
           )}

            {/* Close Button - Overlay on Image Top Right */}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="absolute top-4 right-4 bg-black/60 hover:bg-red-600 text-white p-2 rounded-full backdrop-blur-md border border-white/10 transition-colors z-50 shadow-lg"
              title="Close"
            >
              <X size={24} />
            </button>

            {/* Compare Button - Below Close Button */}
            {referenceImages && referenceImages.length > 0 && (
              <button 
                onPointerDown={(e) => { e.stopPropagation(); setShowReference(true); }}
                onPointerUp={(e) => { e.stopPropagation(); setShowReference(false); }}
                onPointerLeave={() => setShowReference(false)}
                className={`absolute top-16 right-4 p-2 rounded-full backdrop-blur-md border border-white/10 transition-all z-50 shadow-lg ${showReference ? 'bg-blue-600 text-white scale-110' : 'bg-black/60 text-white hover:bg-white/20'}`}
                title="Hold to compare with reference"
              >
                <Layers size={24} />
              </button>
            )}
        </div>

        {/* Navigation - Right */}
        <button 
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 md:translate-x-16 p-3 rounded-full bg-white/10 backdrop-blur text-white transition-all z-20 hover:bg-white/20 hover:scale-110`}
        >
            <ChevronRight size={32} />
        </button>

        {/* Info Panel (Desktop: Right, Mobile: Bottom) */}
        <div className="w-full md:w-80 flex-shrink-0 bg-[#1a1a2e] rounded-xl border border-[#3c3c6a] flex flex-col text-white shadow-xl overflow-hidden z-10">
           <div className="p-4 border-b border-[#3c3c6a] bg-[#21213e]">
              <h3 className="font-bold text-lg text-purple-300">이미지 상세 정보</h3>
              {timestamp && (
                  <p className="text-xs text-gray-400 mt-1">{new Date(timestamp).toLocaleString()}</p>
              )}
           </div>
           
           <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-5">
              
              {/* Core Stats Section */}
              {coreStats && (
                  <div>
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2 border-b border-gray-700 pb-1">Model Specs</label>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-[#0f0f16] p-2 rounded border border-gray-700 flex flex-col">
                              <span className="text-gray-500 mb-0.5">Gender</span>
                              <span className="text-gray-200 font-medium">{coreStats.gender}</span>
                          </div>
                          <div className="bg-[#0f0f16] p-2 rounded border border-gray-700 flex flex-col">
                              <span className="text-gray-500 mb-0.5">Age</span>
                              <span className="text-gray-200 font-medium">{age || 'N/A'}</span>
                          </div>
                          <div className="bg-[#0f0f16] p-2 rounded border border-gray-700 flex flex-col">
                              <span className="text-gray-500 mb-0.5">Height</span>
                              <span className="text-gray-200 font-medium">{coreStats.height}cm</span>
                          </div>
                          <div className="bg-[#0f0f16] p-2 rounded border border-gray-700 flex flex-col">
                              <span className="text-gray-500 mb-0.5">Ethnicity</span>
                              <span className="text-gray-200 font-medium">{coreStats.ethnicity}</span>
                          </div>
                          <div className="bg-[#0f0f16] p-2 rounded border border-gray-700 flex flex-col">
                              <span className="text-gray-500 mb-0.5">Physique</span>
                              <span className="text-gray-200 font-medium">{coreStats.physique}</span>
                          </div>
                          {bodyDetail && (
                              <div className="bg-[#0f0f16] p-2 rounded border border-gray-700 flex flex-col">
                                  <span className="text-gray-500 mb-0.5">Body Detail</span>
                                  <span className="text-gray-200 font-medium truncate" title={bodyDetail}>{bodyDetail}</span>
                              </div>
                          )}
                      </div>
                      {viewType && (
                          <div className="mt-2 bg-blue-900/30 p-2 rounded border border-blue-800 text-xs flex items-center gap-2">
                              <Eye size={12} className="text-blue-400" />
                              <span className="text-blue-200 font-medium">{viewType.replace('_', ' ')} View</span>
                          </div>
                      )}
                  </div>
              )}

              {/* Details Section */}
              {(faceDetail || hairDetail || bodyDetail || poseDetail || faceReferenceWeight) && (
                  <div>
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2 border-b border-gray-700 pb-1">Details</label>
                      <div className="space-y-2 text-xs">
                          {faceReferenceWeight && (
                               <div className="bg-blue-900/20 p-2 rounded border border-blue-800/50">
                                  <span className="text-blue-400 block mb-0.5 flex items-center gap-1"><Sliders size={10} /> Face Ref Weight</span>
                                  <span className="text-blue-200 font-semibold">{faceReferenceWeight}</span>
                               </div>
                          )}
                          {faceDetail && (
                              <div className="bg-[#0f0f16] p-2 rounded border border-gray-700">
                                  <span className="text-gray-500 block mb-0.5">Face</span>
                                  <span className="text-gray-300">{faceDetail}</span>
                              </div>
                          )}
                          {hairDetail && (
                              <div className="bg-[#0f0f16] p-2 rounded border border-gray-700">
                                  <span className="text-gray-500 block mb-0.5">Hair</span>
                                  <span className="text-gray-300">{hairDetail}</span>
                              </div>
                          )}
                          {bodyDetail && (
                              <div className="bg-[#0f0f16] p-2 rounded border border-gray-700">
                                  <span className="text-gray-500 block mb-0.5">Body</span>
                                  <span className="text-gray-300">{bodyDetail}</span>
                              </div>
                          )}
                          {poseDetail && (
                              <div className="bg-[#0f0f16] p-2 rounded border border-gray-700">
                                  <span className="text-gray-500 block mb-0.5">Pose</span>
                                  <span className="text-gray-300">{poseDetail}</span>
                              </div>
                          )}
                      </div>
                  </div>
              )}

              {/* Prompt Section */}
              <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2 border-b border-gray-700 pb-1">Full Prompt</label>
                  <p className="text-[10px] text-gray-400 leading-relaxed bg-[#0f0f16] p-2 rounded border border-[#3c3c6a] max-h-24 overflow-y-auto">
                    {prompt}
                  </p>
              </div>

              {/* Reference Images Section */}
              {referenceImages && referenceImages.length > 0 && (
                  <div>
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2 border-b border-gray-700 pb-1">Used References</label>
                      <div className="grid grid-cols-2 gap-2">
                          {referenceImages.map((ref, idx) => (
                              <img 
                                key={idx} 
                                src={ref} 
                                alt={`Ref ${idx}`} 
                                className="w-full h-auto object-cover rounded border border-[#3c3c6a] hover:scale-105 transition-transform duration-200" 
                              />
                          ))}
                      </div>
                  </div>
              )}
           </div>

           {/* Footer Actions */}
           <div className="p-4 border-t border-[#3c3c6a] bg-[#21213e] space-y-2">
              <button 
                onClick={handleDownload}
                className="w-full py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center justify-center gap-2 transition-colors border border-white/5"
              >
                <Download size={16} /> Download Image
              </button>

              <div className="flex flex-col gap-2 mt-2">
                  {onToFullBody && (
                      <button 
                        onClick={onToFullBody}
                        className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-2 transition-colors shadow-lg"
                      >
                        <Expand size={18} /> To Full Body
                      </button>
                  )}

                  {onUseAsBase && (
                      <button 
                        onClick={onUseAsBase}
                        className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 transition-colors shadow-lg"
                      >
                        <Shirt size={18} /> Use as Base
                      </button>
                  )}
                  
                  {showNextStep && (
                      <div className="flex gap-2">
                          {onNextStep && (
                              <button 
                                onClick={onNextStep}
                                className={`flex-1 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center justify-center gap-2 transition-colors shadow-lg`}
                              >
                                {onSkipToStep3 ? <Camera size={18} /> : <ArrowRight size={18} />} 
                                {onSkipToStep3 ? 'Step 2' : 'Next Step'}
                              </button>
                          )}
                          {onSkipToStep3 && (
                              <button 
                                onClick={onSkipToStep3}
                                className="flex-1 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-2 transition-colors shadow-lg"
                              >
                                <Move size={18} /> Step 3
                              </button>
                          )}
                      </div>
                  )}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default ImageModal;
