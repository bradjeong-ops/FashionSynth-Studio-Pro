
import React, { useRef } from 'react';
import { 
  User, 
  Shirt, 
  Footprints, 
  Glasses,
  CheckCircle2,
  Layers,
  ScanSearch
} from 'lucide-react';
import { FashionCategory } from '../types';
import { resizeImageFile } from '../utils/imageUtils';

interface SidebarProps {
  selectedCategory: FashionCategory;
  onSelectCategory: (category: FashionCategory) => void;
  onUploadBaseImage: (file: File) => void;
  hasBaseImage: boolean;
  userId: string; 
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  selectedCategory, 
  onSelectCategory, 
  onUploadBaseImage,
  hasBaseImage,
  userId
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const MAX_SIZE = 15 * 1024 * 1024; // 15MB (Raw limit check)
      
      if (file.size > MAX_SIZE) {
        alert("파일 용량이 너무 큽니다. 15MB 이하의 이미지만 업로드 가능합니다.");
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      try {
          // 이미지 리사이징 적용 (최대 2048px, 품질 0.8)
          // 리사이징된 결과물은 이미 용량이 최적화되어 있으므로 onUploadBaseImage 내부 로직이 가벼워집니다.
          onUploadBaseImage(file);
      } catch (err) {
          console.error("Image resizing failed", err);
          onUploadBaseImage(file); // Fallback to original if resize fails
      }
    }
  };

  const categories: { id: FashionCategory; icon: React.ReactNode; label: string }[] = [
    { id: 'MIX', icon: <Layers size={20} />, label: 'Mix Match' },
    { id: 'TOPS', icon: <Shirt size={20} />, label: 'Tops' },
    { 
      id: 'BOTTOMS', 
      icon: (
        <svg 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <path d="M16 2H8a2 2 0 0 0-2 2v18h4l2-7 2 7h4V4a2 2 0 0 0-2-2Z" />
          <path d="M6 6h12" />
        </svg>
      ), 
      label: 'Bottoms' 
    }, 
    { id: 'SHOES', icon: <Footprints size={20} />, label: 'Shoes' },
    { id: 'ACCESSORIES', icon: <Glasses size={20} />, label: 'Accessory' },
    { id: 'ANALYSIS', icon: <ScanSearch size={20} />, label: 'Deep Scan' },
  ];

  return (
    <div className="w-20 bg-[#1e293b] border-r border-slate-700 flex flex-col items-center py-6 gap-6 z-20 shrink-0 h-full">
      <div className="relative group">
        <button 
          onClick={() => fileInputRef.current?.click()}
          className={`p-3 rounded-xl transition-all shadow-lg ${
            hasBaseImage 
              ? 'bg-emerald-600 text-white shadow-emerald-900/20' 
              : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-900/20'
          }`}
          title={hasBaseImage ? 'Change Base Model (Max 10MB)' : 'Upload Base Model (Max 10MB)'}
        >
          <User size={24} />
          {hasBaseImage && (
            <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full">
              <CheckCircle2 size={12} fill="white" />
            </div>
          )}
        </button>
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-slate-200 text-xs px-2 py-1.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none border border-slate-700 z-50 flex flex-col items-start gap-0.5">
          <span className="font-bold">{hasBaseImage ? 'Change Base Model' : 'Upload Base Model'}</span>
          <span className="text-[10px] text-amber-400">Auto-compressed for performance</span>
        </div>
      </div>
      
      <div className="w-10 h-[1px] bg-slate-700/50"></div>
      
      <div className="flex flex-col gap-4 w-full px-2 flex-1 overflow-y-auto no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all group relative ${
              selectedCategory === cat.id
                ? 'bg-slate-700 text-blue-400 ring-1 ring-blue-500/50'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
          >
            {cat.icon}
            <span className={`text-[10px] mt-1 font-medium ${selectedCategory === cat.id ? 'text-blue-400' : 'text-slate-500'}`}>
              {cat.label}
            </span>
            {selectedCategory === cat.id && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r"></div>
            )}
          </button>
        ))}
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept="image/*"
      />
    </div>
  );
};
