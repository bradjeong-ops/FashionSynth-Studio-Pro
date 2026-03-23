
import React from 'react';
import { Sun, CloudFog, Layers } from 'lucide-react';

interface AdvancedCompositionControlProps {
  lightingMatch: number;
  setLightingMatch: (val: number) => void;
  shadowIntensity: number;
  setShadowIntensity: (val: number) => void;
}

export const AdvancedCompositionControl: React.FC<AdvancedCompositionControlProps> = ({
  lightingMatch,
  setLightingMatch,
  shadowIntensity,
  setShadowIntensity
}) => {
  return (
    <div className="w-full p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-4 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2 text-slate-200 font-semibold border-b border-slate-700/50 pb-2 mb-2">
        <Layers size={18} className="text-purple-400" />
        <h3>Pro 합성 설정</h3>
      </div>

      {/* 조명 일치도 (Lighting Match) */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <label className="flex items-center gap-1 text-slate-400">
            <Sun size={14} /> 배경 조명 동기화
          </label>
          <span className="text-purple-400 font-mono">{lightingMatch}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={lightingMatch}
          onChange={(e) => setLightingMatch(Number(e.target.value))}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
        <p className="text-[10px] text-slate-500">
          높을수록 배경의 빛 방향과 색온도를 피사체에 강하게 적용합니다.
        </p>
      </div>

      {/* 그림자 강도 (Shadow Intensity) */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <label className="flex items-center gap-1 text-slate-400">
            <CloudFog size={14} /> 접지 그림자 강도
          </label>
          <span className="text-purple-400 font-mono">{shadowIntensity}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={shadowIntensity}
          onChange={(e) => setShadowIntensity(Number(e.target.value))}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
        <p className="text-[10px] text-slate-500">
          발 밑 그림자의 진하기를 조절하여 '떠있는 느낌'을 제거합니다.
        </p>
      </div>
    </div>
  );
};
