import React from 'react';
import { GenerationHistoryItem } from '../types';
import { Trash2 } from 'lucide-react';

interface HistoryGridProps {
  history: GenerationHistoryItem[];
  onDelete: (id: string) => void;
  onSelect: (item: GenerationHistoryItem) => void;
}

const HistoryGrid: React.FC<HistoryGridProps> = ({ history, onDelete, onSelect }) => {
  if (history.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500">
        <p>생성된 이미지가 없습니다.</p>
      </div>
    );
  }

  // Display newest first
  const reversedHistory = [...history].reverse();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {reversedHistory.map((item) => (
        <div key={item.id} className="relative group rounded-lg overflow-hidden border border-[#3c3c6a] bg-[#1a1a2e] aspect-[3/4]">
          <img 
            src={item.base64Data} 
            alt="Generated History" 
            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
            onClick={() => onSelect(item)}
          />
          
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none">
             <div className="pointer-events-auto flex justify-between items-center">
                 <span className="text-[10px] text-gray-300 truncate w-2/3">{new Date(item.timestamp).toLocaleTimeString()}</span>
                 <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id);
                    }}
                    className="p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-md transition-colors"
                 >
                    <Trash2 size={14} />
                 </button>
             </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default HistoryGrid;