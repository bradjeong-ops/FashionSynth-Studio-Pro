
import React, { useState, useRef, useEffect } from 'react';
import { Wand2, RotateCcw } from 'lucide-react';

interface CameraMannequinControlProps {
  onChange: (prompt: string) => void;
}

// Data Mappings
const VERTICAL_ANGLES = [
  { label: '항공뷰 (Aerial View)', value: 90, desc: 'Aerial View' },
  { label: '버즈아이 (Bird\'s Eye)', value: 65, desc: 'Bird\'s Eye View' },
  { label: '극적하이앵글 (Dramatic High)', value: 45, desc: 'Dramatic High Angle' },
  { label: '하이앵글 (High Angle)', value: 25, desc: 'High Angle' },
  { label: '아이레벨 (Eye Level)', value: 0, desc: 'Eye Level Shot' },
  { label: '로우앵글 (Low Angle)', value: -25, desc: 'Low Angle' },
  { label: '극적로우앵글 (Dramatic Low)', value: -45, desc: 'Dramatic Low Angle' },
  { label: '웜즈 아이 (Worm\'s Eye)', value: -90, desc: 'Worm\'s Eye View' },
];

const HORIZONTAL_ANGLES = [
  { label: '후면 (Back)', value: 180, desc: 'Back View' },
  { label: '후방좌측 (Back Left)', value: 135, desc: 'Back Left View' },
  { label: '좌측 (Left)', value: 90, desc: 'Left Side View' },
  { label: '전방좌측 (Front Left)', value: 45, desc: 'Front Left View' },
  { label: '정면 (Front)', value: 0, desc: 'Front View' },
  { label: '전방우측 (Front Right)', value: -45, desc: 'Front Right View' },
  { label: '우측 (Right)', value: -90, desc: 'Right Side View' },
  { label: '후방우측 (Back Right)', value: -135, desc: 'Back Right View' },
  { label: '후면 (Back)', value: -180, desc: 'Back View' },
];

const DISTANCES = [
  { label: '익스트림 클로즈업', desc: 'Extreme Close Up Shot' },
  { label: '클로즈업', desc: 'Close Up Shot' },
  { label: '미디엄샷', desc: 'Medium Shot' },
  { label: '풀샷', desc: 'Full Shot' },
  { label: '롱샷', desc: 'Long Shot' },
];

const LENSES = [
  '6.5mm', '15mm', '28mm', '35mm', '50mm', '75mm', '90mm', '105mm', '135mm', '150mm', '200mm'
];

export const CameraMannequinControl: React.FC<CameraMannequinControlProps> = ({ onChange }) => {
  // Indices for sliders
  const [vIndex, setVIndex] = useState(4); 
  const [hIndex, setHIndex] = useState(4); 
  const [dIndex, setDIndex] = useState(2); 
  const [lIndex, setLIndex] = useState(3); 
  
  const [invertControl, setInvertControl] = useState(false);

  // Smooth Animation State
  const [visualRotation, setVisualRotation] = useState({ 
      x: -VERTICAL_ANGLES[4].value, 
      y: HORIZONTAL_ANGLES[4].value 
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);

  // Helper to find index
  const findVIndex = (val: number) => VERTICAL_ANGLES.findIndex(item => item.value === val);
  const findHIndex = (val: number) => HORIZONTAL_ANGLES.findIndex(item => item.value === val);

  // Effect to bubble up changes to parent
  useEffect(() => {
    const v = VERTICAL_ANGLES[vIndex].desc;
    const h = HORIZONTAL_ANGLES[hIndex].desc;
    const d = DISTANCES[dIndex].desc;
    const l = LENSES[lIndex];
    const prompt = `Camera Angle: ${v}, Viewpoint: ${h}, Shot Size: ${d}, Lens: ${l}.`;
    onChange(prompt);
  }, [vIndex, hIndex, dIndex, lIndex, onChange]);

  // Sync Slider/Presets to Visual Rotation (when NOT dragging)
  useEffect(() => {
    if (!isDragging) {
      setVisualRotation(prev => {
        const targetX = -VERTICAL_ANGLES[vIndex].value;
        const baseTargetY = HORIZONTAL_ANGLES[hIndex].value;

        // Smart rotation logic
        let targetY = baseTargetY;
        const diff = targetY - prev.y;
        targetY = targetY - 360 * Math.round(diff / 360);

        return { x: targetX, y: targetY };
      });
    }
  }, [vIndex, hIndex, isDragging]);

  // Reset to defaults
  const handleReset = () => {
    setVIndex(4); // Eye Level
    setHIndex(4); // Front
    setDIndex(2); // Medium
    setLIndex(3); // 35mm
  };

  // Face Click Handlers
  const handleFaceClick = (e: React.MouseEvent, face: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom') => {
    e.stopPropagation(); // Prevent drag start when clicking a face
    
    switch (face) {
        case 'front':
            setHIndex(findHIndex(0)); 
            setVIndex(findVIndex(0)); 
            break;
        case 'back':
            setHIndex(0); // Choose 180 (Index 0 is 180)
            setVIndex(findVIndex(0));
            break;
        case 'left':
            setHIndex(findHIndex(90)); 
            setVIndex(findVIndex(0));
            break;
        case 'right':
            setHIndex(findHIndex(-90)); 
            setVIndex(findVIndex(0));
            break;
        case 'top':
            setVIndex(findVIndex(90)); 
            break;
        case 'bottom':
            setVIndex(findVIndex(-90)); 
            break;
    }
  };

  // Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    lastMousePos.current = null;
  };

  const updateIndicesFromRotation = (rotX: number, rotY: number) => {
    // Snap to nearest preset
    const currentVAngle = -rotX; // Visual X is inverted relative to value
    let nearestVIndex = 0;
    let minVDiff = Number.MAX_VALUE;
    
    VERTICAL_ANGLES.forEach((item, idx) => {
        const diff = Math.abs(item.value - currentVAngle);
        if (diff < minVDiff) {
            minVDiff = diff;
            nearestVIndex = idx;
        }
    });

    // Horizontal Snap
    let normalizedY = rotY % 360;
    if (normalizedY > 180) normalizedY -= 360;
    if (normalizedY < -180) normalizedY += 360;

    let nearestHIndex = 0;
    let minHDiff = Number.MAX_VALUE;

    HORIZONTAL_ANGLES.forEach((item, idx) => {
        let diff = Math.abs(item.value - normalizedY);
        if (diff > 180) diff = 360 - diff;
        
        if (diff < minHDiff) {
            minHDiff = diff;
            nearestHIndex = idx;
        }
    });

    if (nearestVIndex !== vIndex) setVIndex(nearestVIndex);
    if (nearestHIndex !== hIndex) setHIndex(nearestHIndex);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !lastMousePos.current) return;

    const deltaX = e.clientX - lastMousePos.current.x;
    const deltaY = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    const sensitivity = 3.5; 
    const dir = invertControl ? -1 : 1;

    const newX = visualRotation.x - (deltaY * sensitivity * dir);
    const newY = visualRotation.y + (deltaX * sensitivity * dir);

    setVisualRotation({ x: newX, y: newY });
    updateIndicesFromRotation(newX, newY);
  };

  const handleMouseLeave = () => {
      if (isDragging) handleMouseUp();
  };

  // Determine active face for styling
  const getActiveFace = () => {
    const x = visualRotation.x;
    if (x <= -45) return 'top';
    if (x >= 45) return 'bottom';

    let y = visualRotation.y % 360;
    if (y > 180) y -= 360;
    if (y < -180) y += 360;

    if (y > -45 && y < 45) return 'front';
    if (y >= 45 && y < 135) return 'left';
    if (y <= -45 && y > -135) return 'right';
    return 'back';
  };

  const activeFace = getActiveFace();

  const getFaceStyle = (face: string) => {
    const isActive = activeFace === face;
    const baseStyle = "absolute w-full h-full border-2 transition-all duration-300 cursor-pointer select-none flex flex-col items-center justify-center backdrop-blur-sm";
    
    if (isActive) {
        return `${baseStyle} bg-indigo-600/70 border-indigo-300 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)] font-bold`;
    }
    return `${baseStyle} bg-slate-800/50 border-slate-600/50 text-slate-400 hover:bg-slate-700/70 hover:text-slate-200 hover:border-slate-500`;
  };

  const scale = 1.4 - (dIndex * 0.2);

  const faceTransforms: Record<string, React.CSSProperties> = {
      front: { transform: 'translateZ(60px)' },
      back: { transform: 'rotateY(180deg) translateZ(60px)' },
      right: { transform: 'rotateY(90deg) translateZ(60px)' },
      left: { transform: 'rotateY(-90deg) translateZ(60px)' },
      top: { transform: 'rotateX(90deg) translateZ(60px)' },
      bottom: { transform: 'rotateX(-90deg) translateZ(60px)' }
  };

  return (
    <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col">
            <h2 className="text-sm font-bold text-slate-200">
               카메라 큐브
            </h2>
            <span className="text-[10px] text-slate-500 font-normal">(Camera Cube)</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">반전</span>
            <button 
                type="button"
                onClick={() => setInvertControl(!invertControl)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${invertControl ? 'bg-indigo-600' : 'bg-slate-600'}`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${invertControl ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
      </div>

      {/* Cube Visualization */}
      <div 
        className={`flex justify-center mb-8 py-12 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ touchAction: 'none' }}
        title="Drag to rotate camera"
      >
        <div className="w-[120px] h-[120px]" style={{ perspective: '1000px' }}>
           <div 
             className="relative w-full h-full"
             style={{ 
                 transformStyle: 'preserve-3d',
                 transform: `scale(${scale}) rotateX(${visualRotation.x}deg) rotateY(${visualRotation.y}deg)`,
                 transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)' 
             }}
           >
              {/* Cube Faces */}
              <div onClick={(e) => handleFaceClick(e, 'front')} className={getFaceStyle('front')} style={faceTransforms.front}>FRONT</div>
              <div onClick={(e) => handleFaceClick(e, 'back')} className={getFaceStyle('back')} style={faceTransforms.back}>BACK</div>
              <div onClick={(e) => handleFaceClick(e, 'right')} className={getFaceStyle('right')} style={faceTransforms.right}>RIGHT</div>
              <div onClick={(e) => handleFaceClick(e, 'left')} className={getFaceStyle('left')} style={faceTransforms.left}>LEFT</div>
              <div onClick={(e) => handleFaceClick(e, 'top')} className={getFaceStyle('top')} style={faceTransforms.top}>TOP</div>
              <div onClick={(e) => handleFaceClick(e, 'bottom')} className={getFaceStyle('bottom')} style={faceTransforms.bottom}>BOTTOM</div>
           </div>
        </div>
      </div>

      <p className="text-center text-xs text-slate-500 mb-6">
        큐브를 드래그하거나 면을 클릭하여 조절하세요.<br/>
        (Drag cube or click faces to adjust)
      </p>

      {/* Controls - OPTIMIZED LAYOUT */}
      <div className="space-y-5">
        {/* Vertical */}
        <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                    <div className="w-1 h-3 bg-purple-500 rounded-full" />
                    상하 각도 (Vertical)
                </span>
                <span className="text-[11px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                    {VERTICAL_ANGLES[vIndex].label}
                </span>
            </div>
            <input 
                type="range" 
                min="0" 
                max={VERTICAL_ANGLES.length - 1} 
                step="1"
                value={vIndex}
                onChange={(e) => setVIndex(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
        </div>

        {/* Horizontal */}
        <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                    <div className="w-1 h-3 bg-blue-500 rounded-full" />
                    좌우 방향 (Horizontal)
                </span>
                <span className="text-[11px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                    {HORIZONTAL_ANGLES[hIndex].label}
                </span>
            </div>
            <input 
                type="range" 
                min="0" 
                max={HORIZONTAL_ANGLES.length - 1} 
                step="1"
                value={hIndex}
                onChange={(e) => setHIndex(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
        </div>

        {/* Distance */}
        <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                    <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                    촬영 거리 (Distance)
                </span>
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                    {DISTANCES[dIndex].label}
                </span>
            </div>
            <input 
                type="range" 
                min="0" 
                max={DISTANCES.length - 1} 
                step="1"
                value={dIndex}
                onChange={(e) => setDIndex(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
        </div>

        {/* Lens */}
        <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                    <div className="w-1 h-3 bg-amber-500 rounded-full" />
                    렌즈 초점 (Lens)
                </span>
                <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                    {LENSES[lIndex]}
                </span>
            </div>
            <input 
                type="range" 
                min="0" 
                max={LENSES.length - 1} 
                step="1"
                value={lIndex}
                onChange={(e) => setLIndex(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="mt-8 flex flex-col gap-3">
        <div className="flex justify-center">
            <button 
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[10px] font-bold rounded-full transition-all border border-slate-700 hover:border-slate-600"
            >
                <RotateCcw size={12} />
                초기화 (Reset)
            </button>
        </div>
      </div>
    </div>
  );
};
