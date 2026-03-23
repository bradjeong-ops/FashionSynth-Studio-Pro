
import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, ZoomIn } from 'lucide-react';
import { ReferenceImage } from '../types';
import { resizeImageFile } from '../utils/imageUtils';

interface ReferenceUploaderProps {
  images: ReferenceImage[];
  onImagesChange: (images: ReferenceImage[]) => void;
  title?: string;
  maxImages?: number;
}

export const ReferenceUploader: React.FC<ReferenceUploaderProps> = ({ images, onImagesChange, title, maxImages }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newImages: ReferenceImage[] = [];
      const MAX_RAW_SIZE = 25 * 1024 * 1024; // 25MB raw limit
      
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        
        if (file.size > MAX_RAW_SIZE) {
            alert(`'${file.name}' 파일이 너무 큽니다. (최대 25MB)`);
            continue;
        }

        try {
            // 디테일 보존을 위해 1536px, 90% 품질로 최적화
            const base64Data = await resizeImageFile(file, 1536, 0.9);

            newImages.push({
              id: Math.random().toString(36).substr(2, 9),
              file,
              url: URL.createObjectURL(file),
              base64: base64Data,
              mimeType: 'image/jpeg'
            });
        } catch (err) {
            console.error("Image processing failed", err);
        }
      }
      
      if (newImages.length === 0) {
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
      }

      if (maxImages === 1) {
          onImagesChange([newImages[0]]);
      } else {
          let updated = [...images, ...newImages];
          if (maxImages && updated.length > maxImages) {
              updated = updated.slice(0, maxImages);
          }
          onImagesChange(updated);
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeImage = (id: string) => {
    const newImages = images.filter(img => img.id !== id);
    onImagesChange(newImages);
  };

  const showAddButton = !maxImages || images.length < maxImages;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <ImageIcon size={16} /> {title || 'Reference Images'}
            </h3>
            <span className="text-[10px] text-blue-400 font-medium">* Optimized for High-Fidelity AI</span>
        </div>
        <span className="text-xs text-slate-500">
            {images.length} {maxImages ? `/ ${maxImages}` : 'selected'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {images.map((img, index) => (
          <div 
            key={img.id} 
            className="relative group aspect-[3/4] bg-slate-800 rounded-md overflow-hidden border border-slate-600 cursor-pointer"
            onClick={() => setPreviewImage(img.url)}
          >
            <img src={img.url} alt={`Ref ${index}`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <div className="p-1 bg-slate-600/80 rounded-full text-white pointer-events-none">
                <ZoomIn size={14} />
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  removeImage(img.id);
                }}
                className="p-1 bg-red-500/80 rounded-full hover:bg-red-600 text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
        
        {showAddButton && (
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="aspect-[3/4] border-2 border-dashed border-slate-600 rounded-md flex flex-col items-center justify-center text-slate-500 hover:text-slate-300 hover:border-slate-400 transition-colors bg-slate-800/50"
          >
            <Upload size={20} className="mb-1" />
            <span className="text-[10px]">Add</span>
          </button>
        )}
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        multiple={maxImages !== 1}
        accept="image/*"
      />

      {previewImage && (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200 cursor-pointer"
            onClick={() => setPreviewImage(null)}
        >
            <button 
                className="absolute top-6 right-6 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
                onClick={() => setPreviewImage(null)}
            >
                <X size={24} />
            </button>
            <img 
                src={previewImage} 
                alt="Full Preview" 
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl border border-slate-700"
            />
        </div>
      )}
    </div>
  );
};
