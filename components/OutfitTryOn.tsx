
import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { ReferenceUploader } from './ReferenceUploader';
import { ReferenceImage, GeneratedImage, AppStatus, FashionCategory, ImageResolution, DeepScanType, DeepScanResult } from '../types';
import { generateFashionImages, analyzeDeepScan, analyzeClothingImage, analyzeBackgroundImage, analyzeColorTone, hasAnyApiKey } from '../services/geminiService';
import { SNEAKER_DEFINITIONS, IDENTITY_LOCK_INSTRUCTION } from '../constants';
import { saveImageToLocal, deleteImageFromLocal, deleteMultipleImages } from '../services/localDb';
import { Download, Wand2, Loader2, AlertCircle, X, ChevronLeft, ChevronRight, ArrowRightLeft, Undo2, Settings2, Sparkles, Timer, Square, MoveHorizontal, Copy, Check, ScanSearch, SplitSquareHorizontal, ZoomIn, Plus, Minus, ImageIcon, User, Camera, Trash2, ArrowUpCircle, RefreshCw, Palette, CloudUpload, CheckSquare, Package, UserCheck, Move, Sun, LayoutGrid, Image as ImageIconLucide } from 'lucide-react';

const DEFAULT_PROMPT = '';

const HIGH_QUALITY_PROMPT = "Masterpiece, best quality, highly detailed, ultra-detailed, 8k resolution, HDR, sharp focus, crisp details, high fidelity, cinematic lighting, natural colors, balanced saturation, accurate color reproduction, crisp edges. Raw photo, photorealistic, Detailed eyes Detailed skin texture";
const NEGATIVE_PROMPT = "worst quality, low quality, normal quality, lowres, blurry, bad anatomy, bad hands, missing fingers, extra digit, text, watermark, signature, New design, altered logo, different pattern, distorted text, wrong spelling, reimagined logo, hallucinated details, changed color, wrong fabric, extra limbs, extra arms, extra legs, mutated hands, 4 arms, centaur, fused body, wrong anatomy, ghosting limbs, disjointed limbs, extra fingers, bad bone structure, desaturated, low contrast, hazy, out of focus, flat colors";

const PRESERVE_BASE_INSTRUCTION = `
# Role
You are a "High-Fidelity Image Reconstructor" (Nano Banana Pro Mode). Your goal is NOT to create new designs, but to strictly RECONSTRUCT the provided reference clothing onto the base model with pixel-level accuracy.

# Visual Anchoring (Primary Source of Truth)
- The [Reference Image] is the absolute "Ground Truth". 
- Do not reinterpret the clothing pattern, texture, or logo.
- Maintain the exact visual details of the provided garment.
- Every logo, text, font, spacing, and graphic element on the clothing is SACRED. Do not "improve" or "stylize" it.

# Structural Freeze (HIGHEST PRIORITY for Base Model)
- Unless explicitly instructed to change pose, the Base Model's body geometry must remain LOCKED.
- **FRAMING LOCK (CRITICAL):** You MUST maintain the exact shot size and camera framing of the [Base Model].
- If the Base Model is an **UPPER BODY SHOT** (waist up), the output MUST be an upper body shot. DO NOT generate legs or feet.
- If the Base Model is a **FULL BODY SHOT**, the output MUST be a full body shot.
- Do not shift the camera, do not rotate the model, do not change the facial expression.
- Imagine you are applying a texture in a 3D software. The mesh (body) does not move.

# CRITICAL: ANATOMY & LIMB COUNT LOCK
- **ZERO TOLERANCE for Extra Limbs:** You must strictly adhere to the visible limbs in the [Base Model].
- **Dynamic Motion Handling:** If the model is moving (e.g., swinging, running), DO NOT redraw the arms in a "standard" resting pose. KEEP the exact angle and blur of the original motion.
- **Texture Mapping Only:** Imagine you are a 3D texture artist. You cannot add new geometry (arms/legs). You can only change the surface material (clothing) of the existing geometry.
- **Verification:** Before generating, count the arms/legs. If > 2, STOP and correct.

# Operational Rules
1. **Identity Lock:** The Base Model's face, body, and pose are immutable.
2. **Texture Mapping:** Treat the Reference Clothing as a texture map. Wrap it to round the Base Model's 3D form without altering the 2D graphic design.
3. **No Hallucinations:** Do not add details that don't exist in the reference.
`;

const STRICT_INVENTORY_INSTRUCTION = `
# STRICT INVENTORY CONTROL (ANTI-HALLUCINATION)
- You are strictly limited to the provided references.
- **DO NOT** hallucinate accessories (hats, glasses, bags, jewelry, scarves, belts) to "complete the look".
- If the user did not explicitly provide a reference image or text prompt for an item (e.g., Hat), **DO NOT GENERATE IT**.
- **Exception:** If the Base Model IS ALREADY WEARING an item (e.g., user uploaded a photo of a person wearing glasses), KEEP THEM. But do NOT add NEW items.
- Focus ONLY on the requested [Active Categories]. Leave all other body parts and accessories exactly as they are in the [Base Model].
`;

interface OutfitTryOnProps {
  transferImage?: string | null;
  userId: string; // New Prop
  onOpenKeySelector?: () => void;
}

// Updated interface to support distinct Background AND Color/Tone settings
interface EnvironmentSettings {
    // Background Section
    changeBackground: boolean;
    backgroundPrompt: string;
    backgroundImage: ReferenceImage | null;
    
    // Color/Tone Section
    changeColor: boolean;
    colorPrompt: string;
    colorImage: ReferenceImage | null;
}

// Define the state structure for a single fashion category input
interface CategoryInputState extends EnvironmentSettings {
    prompt: string;
    mainImages: ReferenceImage[];
    detailImages: ReferenceImage[];
    analysisPrompt: string;
}

// Define the state structure for standard Mix Match inputs
interface StandardMixInputState {
    mainImages: ReferenceImage[];
    detailImages: ReferenceImage[];
    analysisPrompt: string;
}

// Update MixState to support Tops Split and Multiple Accessories
interface MixState extends EnvironmentSettings {
    TOPS: {
        OUTER: StandardMixInputState;
        INNER: StandardMixInputState;
    };
    BOTTOMS: StandardMixInputState;
    SHOES: StandardMixInputState;
    ACCESSORIES: {
        ACC1: StandardMixInputState;
        ACC2: StandardMixInputState;
        ACC3: StandardMixInputState;
    };
}

// Define the state structure for Tops (Outer/Inner) inputs
interface SingleTopsLayerState {
    mainImages: ReferenceImage[];
    detailImages: ReferenceImage[];
    analysisPrompt: string;
}

interface TopsInputState extends EnvironmentSettings {
    OUTER: SingleTopsLayerState;
    INNER: SingleTopsLayerState;
    prompt: string;
}

const OutfitTryOn: React.FC<OutfitTryOnProps> = ({ transferImage, userId, onOpenKeySelector }) => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [selectedCategory, setSelectedCategory] = useState<FashionCategory>('MIX');
  const [resolution, setResolution] = useState<ImageResolution>('1K');
  const [quantity, setQuantity] = useState<number>(4);
  const [progress, setProgress] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const timerIntervalRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [originalBaseImage, setOriginalBaseImage] = useState<ReferenceImage | null>(null);
  const [activeBaseImage, setActiveBaseImage] = useState<ReferenceImage | null>(null);
  const [sliderPosition, setSliderPosition] = useState<number>(50); // Default center
  const imageContainerRef = useRef<HTMLDivElement>(null);
  
  // New States for View Modes
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(2.0); // Default higher zoom level
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isZoomModalOpen) {
      setPanOffset({ x: 0, y: 0 });
      setZoomLevel(2.0);
    }
  }, [isZoomModalOpen]);

  // Selection & Bulk Actions State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Deep Scan State
  const [activeDeepScanTab, setActiveDeepScanTab] = useState<DeepScanType>('PRODUCT');
  const [deepScanData, setDeepScanData] = useState<Record<DeepScanType, { image: ReferenceImage | null, result: DeepScanResult | null }>>({
      PRODUCT: { image: null, result: null },
      MODEL: { image: null, result: null },
      POSE: { image: null, result: null },
      BACKGROUND: { image: null, result: null },
      LIGHTING: { image: null, result: null },
  });

  // Updated initial states with new color fields
  const [categoryInputs, setCategoryInputs] = useState<Record<FashionCategory, CategoryInputState>>({
    TOPS: { prompt: DEFAULT_PROMPT, mainImages: [], detailImages: [], analysisPrompt: '', changeBackground: false, backgroundPrompt: '', backgroundImage: null, changeColor: false, colorPrompt: '', colorImage: null }, // Legacy/Unused
    BOTTOMS: { prompt: DEFAULT_PROMPT, mainImages: [], detailImages: [], analysisPrompt: '', changeBackground: false, backgroundPrompt: '', backgroundImage: null, changeColor: false, colorPrompt: '', colorImage: null },
    SHOES: { prompt: DEFAULT_PROMPT, mainImages: [], detailImages: [], analysisPrompt: '', changeBackground: false, backgroundPrompt: '', backgroundImage: null, changeColor: false, colorPrompt: '', colorImage: null },
    ACCESSORIES: { prompt: DEFAULT_PROMPT, mainImages: [], detailImages: [], analysisPrompt: '', changeBackground: false, backgroundPrompt: '', backgroundImage: null, changeColor: false, colorPrompt: '', colorImage: null },
    MIX: { prompt: DEFAULT_PROMPT, mainImages: [], detailImages: [], analysisPrompt: '', changeBackground: false, backgroundPrompt: '', backgroundImage: null, changeColor: false, colorPrompt: '', colorImage: null }, 
    ANALYSIS: { prompt: '', mainImages: [], detailImages: [], analysisPrompt: '', changeBackground: false, backgroundPrompt: '', backgroundImage: null, changeColor: false, colorPrompt: '', colorImage: null } 
  });

  // State for Tops Split (Outer/Inner)
  const [activeTopsTab, setActiveTopsTab] = useState<'OUTER' | 'INNER'>('OUTER');
  const [topsInputs, setTopsInputs] = useState<TopsInputState>({
    OUTER: { mainImages: [], detailImages: [], analysisPrompt: '' },
    INNER: { mainImages: [], detailImages: [], analysisPrompt: '' },
    prompt: DEFAULT_PROMPT,
    changeBackground: false,
    backgroundPrompt: '',
    backgroundImage: null,
    changeColor: false,
    colorPrompt: '',
    colorImage: null
  });

  // State for Mix Match (Now with Tops Outer/Inner Support and 3 Accessories)
  const [activeMixTopsTab, setActiveMixTopsTab] = useState<'OUTER' | 'INNER'>('OUTER');
  const [activeMixAccTab, setActiveMixAccTab] = useState<'ACC1' | 'ACC2' | 'ACC3'>('ACC1');
  const [mixInputs, setMixInputs] = useState<MixState>({
    TOPS: {
        OUTER: { mainImages: [], detailImages: [], analysisPrompt: '' },
        INNER: { mainImages: [], detailImages: [], analysisPrompt: '' }
    },
    BOTTOMS: { mainImages: [], detailImages: [], analysisPrompt: '' },
    SHOES: { mainImages: [], detailImages: [], analysisPrompt: '' },
    ACCESSORIES: {
        ACC1: { mainImages: [], detailImages: [], analysisPrompt: '' },
        ACC2: { mainImages: [], detailImages: [], analysisPrompt: '' },
        ACC3: { mainImages: [], detailImages: [], analysisPrompt: '' },
    },
    changeBackground: false,
    backgroundPrompt: '',
    backgroundImage: null,
    changeColor: false,
    colorPrompt: '',
    colorImage: null
  });
  
  const [history, setHistory] = useState<Record<FashionCategory, GeneratedImage[]>>({
    TOPS: [], BOTTOMS: [], SHOES: [], ACCESSORIES: [], MIX: [], ANALYSIS: []
  });

  const [historyPages, setHistoryPages] = useState<Record<FashionCategory, number>>({
    TOPS: 1, BOTTOMS: 1, SHOES: 1, ACCESSORIES: 1, MIX: 1, ANALYSIS: 1
  });

  const [selections, setSelections] = useState<Record<FashionCategory, string | null>>({
    TOPS: null, BOTTOMS: null, SHOES: null, ACCESSORIES: null, MIX: null, ANALYSIS: null
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzingBackground, setIsAnalyzingBackground] = useState(false);
  const [isAnalyzingColor, setIsAnalyzingColor] = useState(false); // New state for color analysis
  const [analyzingCategory, setAnalyzingCategory] = useState<string | null>(null); 
  const [copiedField, setCopiedField] = useState<'EN' | 'KR' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- Helper: Base64 to Blob URL ---
  const base64ToBlobUrl = (base64: string, mimeType: string = 'image/png') => {
      try {
          const byteCharacters = atob(base64.includes(',') ? base64.split(',')[1] : base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType });
          return URL.createObjectURL(blob);
      } catch (e) {
          console.error("Blob conversion failed", e);
          return null;
      }
  };

  useEffect(() => {
    if (transferImage) {
        const base64Clean = transferImage.includes(',') ? transferImage.split(',')[1] : transferImage;
        const newBase: ReferenceImage = { id: `transfer-${Date.now()}`, url: transferImage, base64: base64Clean, mimeType: 'image/png' };
        setActiveBaseImage(newBase);
        setOriginalBaseImage(newBase);
        updateSelection(null);
    }
  }, [transferImage]);

  // Determine current prompt based on category
  const getCurrentPrompt = () => {
      if (selectedCategory === 'TOPS') return topsInputs.prompt;
      return categoryInputs[selectedCategory].prompt;
  };
  
  const prompt = getCurrentPrompt();
  
  // History Logic
  const generatedImages = history[selectedCategory] || [];
  const selectedImage = selections[selectedCategory];

  const ITEMS_PER_PAGE = 4;
  const currentPage = historyPages[selectedCategory];
  // Calculate total pages based on filtered results
  const totalPages = Math.ceil(generatedImages.length / ITEMS_PER_PAGE);
  
  // Adjust current page if out of bounds after filtering
  useEffect(() => {
      if (currentPage > totalPages && totalPages > 0) {
          setHistoryPages(prev => ({ ...prev, [selectedCategory]: totalPages }));
      } else if (totalPages === 0 && currentPage !== 1) {
          setHistoryPages(prev => ({ ...prev, [selectedCategory]: 1 }));
      }
  }, [totalPages, currentPage, selectedCategory]);

  const displayedHistory = generatedImages.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handlePageChange = (page: number) => setHistoryPages(prev => ({ ...prev, [selectedCategory]: page }));
  const updateSelection = (url: string | null) => { 
      setSelections(prev => ({ ...prev, [selectedCategory]: url })); 
      setSliderPosition(50); 
      setIsCompareMode(false); // Reset comparison mode when selecting new image
  };

  const handleNavigate = (direction: 'next' | 'prev') => {
    if (!selectedImage || generatedImages.length <= 1) return;
    const currentIndex = generatedImages.findIndex(img => img.url === selectedImage);
    if (currentIndex === -1) return; 
    
    let newIndex = direction === 'prev' ? (currentIndex - 1 + generatedImages.length) % generatedImages.length : (currentIndex + 1) % generatedImages.length;
    updateSelection(generatedImages[newIndex].url);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;
      if (selectedImage) {
        if (e.key === 'ArrowLeft') handleNavigate('prev');
        if (e.key === 'ArrowRight') handleNavigate('next');
        if (e.key === 'Escape') setIsZoomModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, generatedImages]); 

  useEffect(() => {
    if (status === AppStatus.GENERATING) {
      const startTime = Date.now();
      timerIntervalRef.current = window.setInterval(() => setElapsedTime((Date.now() - startTime) / 1000), 100);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [status]);

  // Update helpers
  const updatePrompt = (newPrompt: string) => {
      if (selectedCategory === 'TOPS') {
          setTopsInputs(prev => ({ ...prev, prompt: newPrompt }));
      } else {
          setCategoryInputs(prev => ({ ...prev, [selectedCategory]: { ...prev[selectedCategory], prompt: newPrompt } }));
      }
  };

  // Renamed to updateEnvironmentSettings to cover both BG and Color
  const updateEnvironmentSettings = (category: FashionCategory, field: keyof EnvironmentSettings, value: any) => {
    if (category === 'TOPS') {
        setTopsInputs(prev => ({ ...prev, [field]: value }));
    } else if (category === 'MIX') {
        setMixInputs(prev => ({ ...prev, [field]: value }));
    } else {
        setCategoryInputs(prev => ({
            ...prev,
            [category]: { ...prev[category], [field]: value }
        }));
    }
  };

  const updateCategoryImages = (type: 'mainImages' | 'detailImages', newImages: ReferenceImage[]) => { setCategoryInputs(prev => ({ ...prev, [selectedCategory]: { ...prev[selectedCategory], [type]: newImages } })); };
  const updateCategoryAnalysis = (text: string) => { setCategoryInputs(prev => ({ ...prev, [selectedCategory]: { ...prev[selectedCategory], analysisPrompt: text } })); };
  
  const updateMixImages = (key: keyof MixState, type: 'mainImages' | 'detailImages', newImages: ReferenceImage[], subTab?: string) => { 
      setMixInputs(prev => {
          if (key === 'TOPS' && (subTab === 'OUTER' || subTab === 'INNER')) {
              return {
                  ...prev,
                  TOPS: {
                      ...prev.TOPS,
                      [subTab]: {
                          ...prev.TOPS[subTab as 'OUTER'|'INNER'],
                          [type]: newImages
                      }
                  }
              };
          } else if (key === 'ACCESSORIES' && (subTab === 'ACC1' || subTab === 'ACC2' || subTab === 'ACC3')) {
               return {
                  ...prev,
                  ACCESSORIES: {
                      ...prev.ACCESSORIES,
                      [subTab]: {
                          ...prev.ACCESSORIES[subTab as 'ACC1'|'ACC2'|'ACC3'],
                          [type]: newImages
                      }
                  }
              };
          } else if (key !== 'TOPS' && key !== 'ACCESSORIES' && key !== 'changeBackground' && key !== 'backgroundPrompt' && key !== 'backgroundImage' && key !== 'changeColor' && key !== 'colorPrompt' && key !== 'colorImage') {
               return {
                  ...prev,
                  [key]: {
                      ...(prev[key] as StandardMixInputState),
                      [type]: newImages
                  }
              } as MixState;
          }
          return prev;
      }); 
  };
  
  const updateMixAnalysis = (key: keyof MixState, text: string, subTab?: string) => { 
      setMixInputs(prev => {
          if (key === 'TOPS' && (subTab === 'OUTER' || subTab === 'INNER')) {
               return {
                  ...prev,
                  TOPS: {
                      ...prev.TOPS,
                      [subTab]: {
                          ...prev.TOPS[subTab as 'OUTER'|'INNER'],
                          analysisPrompt: text
                      }
                  }
              };
          } else if (key === 'ACCESSORIES' && (subTab === 'ACC1' || subTab === 'ACC2' || subTab === 'ACC3')) {
               return {
                  ...prev,
                  ACCESSORIES: {
                      ...prev.ACCESSORIES,
                      [subTab]: {
                          ...prev.ACCESSORIES[subTab as 'ACC1'|'ACC2'|'ACC3'],
                          analysisPrompt: text
                      }
                  }
              };
          } else if (key !== 'TOPS' && key !== 'ACCESSORIES' && key !== 'changeBackground' && key !== 'backgroundPrompt' && key !== 'backgroundImage' && key !== 'changeColor' && key !== 'colorPrompt' && key !== 'colorImage') {
              return {
                  ...prev,
                  [key]: {
                      ...(prev[key] as StandardMixInputState),
                      analysisPrompt: text
                  }
              } as MixState;
          }
          return prev;
      }); 
  };

  // New helpers for TOPS (Outer/Inner)
  const updateTopsImages = (subTab: 'OUTER' | 'INNER', type: 'mainImages' | 'detailImages', newImages: ReferenceImage[]) => {
      setTopsInputs(prev => ({
          ...prev,
          [subTab]: { ...prev[subTab], [type]: newImages }
      }));
  };
  const updateTopsAnalysis = (subTab: 'OUTER' | 'INNER', text: string) => {
      setTopsInputs(prev => ({
          ...prev,
          [subTab]: { ...prev[subTab], analysisPrompt: text }
      }));
  };

  // --- Clear Handlers (Refined: Clears Images AND Prompts) ---
  const handleClearSection = (
      type: 'TOPS' | 'MIX' | 'CATEGORY', 
      subKey?: string, 
      subTab?: string
  ) => {
      // REMOVED window.confirm due to blocking issues report
      console.log(`Executing Clear for: ${type}, subKey: ${subKey}, subTab: ${subTab}`);

      // 2. Logic for TOPS (Clears Outer/Inner images + Shared Prompt)
      if (type === 'TOPS') {
          const tab = subKey as 'OUTER' | 'INNER';
          if (tab === 'OUTER' || tab === 'INNER') {
            setTopsInputs(prev => ({
                ...prev,
                [tab]: { mainImages: [], detailImages: [], analysisPrompt: '' },
                prompt: '' // Clear shared prompt
            }));
          }
      } 
      // 3. Logic for MIX (Clears specific slot images)
      else if (type === 'MIX') {
          setMixInputs(prev => {
              // Deep copy / granular update to ensure reactivity
              if (subKey === 'TOPS') {
                  if (subTab === 'OUTER' || subTab === 'INNER') {
                      return {
                          ...prev,
                          TOPS: {
                              ...prev.TOPS,
                              [subTab]: { mainImages: [], detailImages: [], analysisPrompt: '' }
                          }
                      };
                  }
              } else if (subKey === 'ACCESSORIES') {
                  if (subTab === 'ACC1' || subTab === 'ACC2' || subTab === 'ACC3') {
                      return {
                          ...prev,
                          ACCESSORIES: {
                              ...prev.ACCESSORIES,
                              [subTab]: { mainImages: [], detailImages: [], analysisPrompt: '' }
                          }
                      };
                  }
              } else if (subKey === 'BOTTOMS' || subKey === 'SHOES') {
                  return {
                      ...prev,
                      [subKey]: {
                          ...(prev[subKey] as StandardMixInputState),
                          mainImages: [], detailImages: [], analysisPrompt: ''
                      }
                  };
              }
              return prev;
          });
      } 
      // 4. Logic for Standard Categories (Clears images + Prompt)
      else if (type === 'CATEGORY') {
          if (subKey && categoryInputs[subKey as FashionCategory]) {
             setCategoryInputs(prev => ({
                  ...prev,
                  [subKey as FashionCategory]: {
                      ...prev[subKey as FashionCategory],
                      mainImages: [],
                      detailImages: [],
                      analysisPrompt: '',
                      prompt: ''
                  }
              }));
          }
      }
  };

  // -----------------------------

  const handleBaseImageUpload = async (file: File) => {
    const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
            }
        };
        reader.readAsDataURL(file);
    });
    const newBase = { id: 'base-model', file, url: URL.createObjectURL(file), base64, mimeType: file.type };
    setOriginalBaseImage(newBase);
    setActiveBaseImage(newBase);
    updateSelection(null);
  };

  const handleCategorySelect = (category: FashionCategory) => { if (category !== selectedCategory) { setSelectedCategory(category); setErrorMsg(null); setIsSelectionMode(false); setSelectedIds(new Set()); } };
  
  const handleSetGeneratedAsBase = async () => {
    if (!selectedImage) return;
    
    let base64Data = "";
    let mimeType = "image/png";
    
    const matches = selectedImage.match(/^data:(.+);base64,(.+)$/);
    if (matches) {
        mimeType = matches[1];
        base64Data = matches[2];
    } else {
        try {
            const response = await fetch(selectedImage);
            const blob = await response.blob();
            mimeType = blob.type;
            base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const res = reader.result as string;
                    resolve(res.split(',')[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to convert generated image to base64", e);
        }
    }

    const newBase: ReferenceImage = { 
        id: `gen-base-${Date.now()}`, 
        url: selectedImage, 
        base64: base64Data, 
        mimeType: mimeType 
    };
    setActiveBaseImage(newBase);
    updateSelection(null); 
  };

  const handleRevertBase = () => { if (originalBaseImage) setActiveBaseImage(originalBaseImage); };
  const handleCancelGeneration = () => { if (abortControllerRef.current) abortControllerRef.current.abort(); setStatus(AppStatus.IDLE); setProgress(0); setErrorMsg("Generation cancelled."); };
  
  const handleImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeBaseImage || !imageContainerRef.current || !isCompareMode) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    setSliderPosition((Math.max(0, Math.min(e.clientX - rect.left, rect.width)) / rect.width) * 100);
  };

  const handleDeepScan = async () => {
    const imageData = deepScanData[activeDeepScanTab].image;
    if (!imageData) {
        setErrorMsg("Please upload an image to scan.");
        return;
    }
    
    setIsAnalyzing(true);
    setErrorMsg(null);
    
    try {
        const result = await analyzeDeepScan(imageData.base64, imageData.mimeType, activeDeepScanTab);
        setDeepScanData(prev => ({
            ...prev,
            [activeDeepScanTab]: { ...prev[activeDeepScanTab], result }
        }));
    } catch (error: any) {
        const msg = error instanceof Error ? error.message : "Analysis failed";
        setErrorMsg(msg);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleClothingAnalysis = async (mainImages: ReferenceImage[], detailImages: ReferenceImage[], onComplete: (text: string) => void, sectionId: string) => {
      const allImages = [...mainImages, ...detailImages];
      if (allImages.length === 0) return;
      setAnalyzingCategory(sectionId);
      try { 
          // Detect category and pass to analyzeClothingImage
          const category = sectionId.includes('SHOES') ? 'SHOES' : 'GENERAL';
          const analysisText = await analyzeClothingImage(allImages.map(img => ({ base64: img.base64, mimeType: img.mimeType })), category); 
          onComplete(analysisText); 
      } catch (e: any) { 
          const msg = e instanceof Error ? e.message : String(e);
          setErrorMsg("Analysis failed: " + msg); 
      } finally { setAnalyzingCategory(null); }
  };

  const handleBackgroundAnalysis = async (bgImage: ReferenceImage, onComplete: (text: string) => void) => {
    setIsAnalyzingBackground(true);
    setErrorMsg(null);
    try {
        const result = await analyzeBackgroundImage(bgImage.base64);
        onComplete(result);
    } catch (err: any) {
        setErrorMsg("Failed to analyze background image.");
    } finally {
        setIsAnalyzingBackground(false);
    }
  };

  const handleColorAnalysis = async (colorImage: ReferenceImage, onComplete: (text: string) => void) => {
    setIsAnalyzingColor(true);
    setErrorMsg(null);
    try {
        const result = await analyzeColorTone(colorImage.base64);
        onComplete(result);
    } catch (err: any) {
        setErrorMsg("Failed to analyze color tone.");
    } finally {
        setIsAnalyzingColor(false);
    }
  };

  const copyToClipboard = (text: string, type: 'EN' | 'KR') => { navigator.clipboard.writeText(text); setCopiedField(type); setTimeout(() => setCopiedField(null), 2000); };

  const handleDownload = (image: GeneratedImage | undefined) => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image.url;
    link.download = `generated-fashion-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- SELECTION HANDLERS ---
  const toggleSelection = (id: string) => {
      setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  const handleSelectAll = () => {
      const ids = generatedImages.map(i => i.id);
      setSelectedIds(new Set(ids));
  };

  const handleDeselectAll = () => {
      setSelectedIds(new Set());
  };

  // --- HARD DELETE HANDLERS ---
  const handleDeleteItem = async (id: string) => {
      // Find item
      const item = (history[selectedCategory] || []).find(i => i.id === id);

      if (!window.confirm("이 이미지를 영구적으로 삭제하시겠습니까? (갤러리에서도 삭제됩니다)")) return;

      // 1. Remove from Local UI immediately (Optimistic Update)
      try {
          setHistory(prev => {
              const currentList = prev[selectedCategory] || [];
              const nextList = currentList.filter(item => item.id !== id);
              return { ...prev, [selectedCategory]: nextList };
          });
          
          if (selectedImage && generatedImages.find(img => img.id === id)?.url === selectedImage) {
              updateSelection(null);
          }
      } catch (err) {
          console.error("Failed to delete item locally", err);
      }

      // 2. Remove from LocalDB (Server Delete)
      if (userId && item && item.id) { 
          try {
              await deleteImageFromLocal(item.id);
              console.log("Permanently deleted from local:", item.id);
          } catch (error) {
              console.error("Local delete failed:", error);
          }
      }
  };

  const handleBulkDelete = async () => {
      if (selectedIds.size === 0) return;
      if (!window.confirm(`선택한 ${selectedIds.size}개의 이미지를 영구적으로 삭제하시겠습니까?`)) return;

      setIsDeleting(true);

      const itemsToDelete = generatedImages.filter(item => selectedIds.has(item.id));
      
      // 1. Optimistic Local Update
      setHistory(prev => {
          const currentList = prev[selectedCategory] || [];
          const nextList = currentList.filter(item => !selectedIds.has(item.id));
          return { ...prev, [selectedCategory]: nextList };
      });
      
      if (selectedImage && generatedImages.find(img => img.url === selectedImage && selectedIds.has(img.id))) {
          updateSelection(null);
      }

      // 2. Server Delete (Bulk)
      const localItemsToDelete = itemsToDelete
          .filter(item => item.id) // Only sync'd items
          .map(item => ({ id: item.id! }));

      if (localItemsToDelete.length > 0) {
          await deleteMultipleImages(localItemsToDelete);
          console.log(`Bulk deleted ${localItemsToDelete.length} items from local.`);
      }

      setIsDeleting(false);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
  };

  const getCurrentGeneratedImage = () => generatedImages.find(img => img.url === selectedImage);
  const currentImg = getCurrentGeneratedImage();

  const handleUpscale = async (targetRes: ImageResolution) => {
      if (!selectedImage) return;
      const img = getCurrentGeneratedImage();
      if (!img) return;

      setErrorMsg(null);
      setStatus(AppStatus.GENERATING);
      setProgress(0);
      setElapsedTime(0);
      
      abortControllerRef.current = new AbortController();

      try {
          // Fix: Handle blob URLs by fetching and converting to base64
          let base64Data = "";
          if (selectedImage.startsWith('data:')) {
              base64Data = selectedImage.split(',')[1];
          } else {
              try {
                  const response = await fetch(selectedImage);
                  const blob = await response.blob();
                  base64Data = await new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                          const res = reader.result as string;
                          resolve(res.split(',')[1]);
                      };
                      reader.onerror = reject;
                      reader.readAsDataURL(blob);
                  });
              } catch (e) {
                  console.error("Failed to convert image to base64", e);
                  base64Data = selectedImage; // Fallback
              }
          }

          const ref: ReferenceImage = {
              id: 'source-1k',
              base64: base64Data,
              url: selectedImage,
              mimeType: 'image/png'
          };

          const upscalePrompt = `
Task: High-Fidelity Image Upscaling.
Input: A 1K resolution drafted image.
Goal: Re-render this EXACT image at ${targetRes} resolution.

STRICT CONSTRAINTS:
1. POSE & ANATOMY: Absolute Freeze. Do not move a single pixel of the body structure.
2. COMPOSITION: Keep the exact framing and background.
3. CLOTHING: Preserve all design details, logos, and textures from the input.
4. QUALITY: Increase sharpness, texture detail, and lighting depth. Eliminate artifacts.

This is a technical upscaling task, not a creative redesign.
Original Context: ${img.prompt}
          `;

          // Generate 1 high-res image
          // Force Pro model for upscaling
          await generateFashionImages(
              upscalePrompt, 
              [ref], 
              1, 
              targetRes, 
              async (url) => {
                  setProgress(100);
                  // Use Stable ID (UUID)
                  const stableId = crypto.randomUUID();
                  const blobUrl = base64ToBlobUrl(url);

                  const newImg: GeneratedImage = { 
                      id: stableId, // Local ID
                      url: blobUrl || url, 
                      prompt: img.prompt, 
                      resolution: targetRes, 
                      category: selectedCategory, 
                      timestamp: Date.now(),
                      isUploading: true,
                      tempUrl: blobUrl || undefined
                  };
                  
                  // Add to history
                  setHistory(prev => ({ ...prev, [selectedCategory]: [newImg, ...prev[selectedCategory]].slice(0, 16) }));
                  // Select the new upscaled image
                  updateSelection(newImg.url);

                  // --- Auto Save Upscaled Image ---
                  if (userId) {
                    saveImageToLocal(userId, {
                        ...newImg,
                        category: selectedCategory as any,
                        prompt: img.prompt
                    }, url).then((result) => {
                        if (result) {
                            // On success, update with id
                            setHistory(prev => ({
                                ...prev,
                                [selectedCategory]: prev[selectedCategory].map(item => 
                                    item.id === stableId ? { 
                                        ...item, 
                                        isUploading: false, 
                                        id: result.id, // Set Server ID
                                        storagePath: result.storagePath 
                                    } : item
                                )
                            }));
                        }
                    }).catch(e => {
                        console.error("Auto-save upscale failed", e);
                        setHistory(prev => ({
                            ...prev,
                            [selectedCategory]: prev[selectedCategory].map(item => 
                                item.id === stableId ? { ...item, isUploading: false } : item
                            )
                        }));
                    });
                  }
                  // --------------------------------

              },
              abortControllerRef.current.signal,
              true // forcePro = true for Upscale
          );
          
          setStatus(AppStatus.SUCCESS);
      } catch (e: any) {
           if (e.message !== "Operation cancelled by user") { 
            const msg = e instanceof Error ? e.message : String(e);
            setErrorMsg(msg || "Upscale failed."); 
            setStatus(AppStatus.ERROR); 
          } 
      } finally {
          abortControllerRef.current = null;
      }
  };

  const handleGenerate = async () => {
    setErrorMsg(null); setProgress(0); setElapsedTime(0); setSliderPosition(50);
    
    // Improved API Key Check using centralized helper
    const hasKey = await hasAnyApiKey();
    if (!hasKey) {
        if (onOpenKeySelector) { 
            onOpenKeySelector(); 
            return; 
        }
        
        // Fallback to AI Studio if available
        const aiStudio = (window as any).aistudio || (window.parent as any).aistudio;
        if (aiStudio && aiStudio.openSelectKey) {
            try {
                await aiStudio.openSelectKey();
                const nowHasKey = await aiStudio.hasSelectedApiKey();
                if (!nowHasKey) return;
            } catch (e) {
                console.error("AI Studio Key Error:", e);
                return;
            }
        } else {
            setErrorMsg("API Key가 필요합니다. 설정에서 API Key를 입력해 주세요.");
            return;
        }
    }

    let hasRefs = false;
    
    if (selectedCategory === 'TOPS') {
        hasRefs = topsInputs.OUTER.mainImages.length > 0 || topsInputs.INNER.mainImages.length > 0;
    } else if (selectedCategory === 'MIX') {
        hasRefs = 
            mixInputs.TOPS.OUTER.mainImages.length > 0 || 
            mixInputs.TOPS.INNER.mainImages.length > 0 ||
            mixInputs.BOTTOMS.mainImages.length > 0 || 
            mixInputs.SHOES.mainImages.length > 0 || 
            mixInputs.ACCESSORIES.ACC1.mainImages.length > 0 ||
            mixInputs.ACCESSORIES.ACC2.mainImages.length > 0 ||
            mixInputs.ACCESSORIES.ACC3.mainImages.length > 0;
    } else {
        hasRefs = categoryInputs[selectedCategory].mainImages.length > 0;
    }

    if (!activeBaseImage && !hasRefs && prompt.trim().length === 0) { setErrorMsg("Please add a base model, reference images, or a prompt."); return; }

    abortControllerRef.current = new AbortController();
    setStatus(AppStatus.GENERATING);
    
    const generationCount = quantity;
    let completedCount = 0;

    // Reset pagination to first page
    setHistoryPages(prev => ({ ...prev, [selectedCategory]: 1 }));

    try {
      // --- Step 1: Describe-then-Generate (Auto Analysis) ---
      // We process pending analyses in parallel before generation
      
      const analysisTasks: Promise<void>[] = [];
      const updatedAnalyses: { [key: string]: string } = {}; // Store results to update state locally

      const queueAnalysis = (imgs: ReferenceImage[], currentText: string, key: string, updateFn: (txt: string) => void) => {
          if (imgs.length > 0 && (!currentText || currentText.trim().length < 5)) {
               analysisTasks.push((async () => {
                   try {
                       const cat = key.includes('SHOES') ? 'SHOES' : 'GENERAL';
                       const text = await analyzeClothingImage(imgs.map(i => ({ base64: i.base64, mimeType: i.mimeType })), cat);
                       updateFn(text);
                       updatedAnalyses[key] = text;
                   } catch (e) { console.warn(`Auto-analysis failed for ${key}`, e); }
               })());
          }
      };

      if (selectedCategory === 'TOPS') {
          queueAnalysis([...topsInputs.OUTER.mainImages, ...topsInputs.OUTER.detailImages], topsInputs.OUTER.analysisPrompt, 'TOPS_OUTER', (t) => updateTopsAnalysis('OUTER', t));
          queueAnalysis([...topsInputs.INNER.mainImages, ...topsInputs.INNER.detailImages], topsInputs.INNER.analysisPrompt, 'TOPS_INNER', (t) => updateTopsAnalysis('INNER', t));
      } else if (selectedCategory === 'MIX') {
          queueAnalysis([...mixInputs.TOPS.OUTER.mainImages, ...mixInputs.TOPS.OUTER.detailImages], mixInputs.TOPS.OUTER.analysisPrompt, 'MIX_TOPS_OUTER', (t) => updateMixAnalysis('TOPS', t, 'OUTER'));
          queueAnalysis([...mixInputs.TOPS.INNER.mainImages, ...mixInputs.TOPS.INNER.detailImages], mixInputs.TOPS.INNER.analysisPrompt, 'MIX_TOPS_INNER', (t) => updateMixAnalysis('TOPS', t, 'INNER'));
          queueAnalysis([...mixInputs.BOTTOMS.mainImages, ...mixInputs.BOTTOMS.detailImages], mixInputs.BOTTOMS.analysisPrompt, 'MIX_BOTTOMS', (t) => updateMixAnalysis('BOTTOMS', t));
          queueAnalysis([...mixInputs.SHOES.mainImages, ...mixInputs.SHOES.detailImages], mixInputs.SHOES.analysisPrompt, 'MIX_SHOES', (t) => updateMixAnalysis('SHOES', t));
          queueAnalysis([...mixInputs.ACCESSORIES.ACC1.mainImages, ...mixInputs.ACCESSORIES.ACC1.detailImages], mixInputs.ACCESSORIES.ACC1.analysisPrompt, 'MIX_ACC1', (t) => updateMixAnalysis('ACCESSORIES', t, 'ACC1'));
          queueAnalysis([...mixInputs.ACCESSORIES.ACC2.mainImages, ...mixInputs.ACCESSORIES.ACC2.detailImages], mixInputs.ACCESSORIES.ACC2.analysisPrompt, 'MIX_ACC2', (t) => updateMixAnalysis('ACCESSORIES', t, 'ACC2'));
          queueAnalysis([...mixInputs.ACCESSORIES.ACC3.mainImages, ...mixInputs.ACCESSORIES.ACC3.detailImages], mixInputs.ACCESSORIES.ACC3.analysisPrompt, 'MIX_ACC3', (t) => updateMixAnalysis('ACCESSORIES', t, 'ACC3'));
      } else {
          queueAnalysis([...categoryInputs[selectedCategory].mainImages, ...categoryInputs[selectedCategory].detailImages], categoryInputs[selectedCategory].analysisPrompt, selectedCategory, (t) => updateCategoryAnalysis(t));
      }

      if (analysisTasks.length > 0) {
          setProgress(5); // Show some progress for analysis
          // Run analysis tasks sequentially to avoid network congestion/502 errors
          for (const task of analysisTasks) {
              await task;
          }
      }
      
      setProgress(10); // Analysis done, starting generation

      // --- Step 2: Generation Construction ---

      let contextPrompt = '';
      let finalImages: ReferenceImage[] = [];
      let negativePrompt = NEGATIVE_PROMPT; // Base negative prompt

      // Helper to get analysis text (either current or just generated)
      const getAnalysis = (current: string, key: string) => updatedAnalyses[key] || current || '';
      
      // Track Active Inventory
      const activeInventory: string[] = [];

      if (selectedCategory === 'TOPS') {
          // Special logic for Tops (Outer + Inner)
          finalImages = activeBaseImage ? [activeBaseImage] : [];
          const outerImages = [...topsInputs.OUTER.mainImages, ...topsInputs.OUTER.detailImages];
          const innerImages = [...topsInputs.INNER.mainImages, ...topsInputs.INNER.detailImages];

          if (activeBaseImage) {
              contextPrompt = PRESERVE_BASE_INSTRUCTION + '\n\n';
              contextPrompt += STRICT_INVENTORY_INSTRUCTION + '\n\n';
              contextPrompt += `Task: Virtual Try-On for TOPS (Layered).\n`;
              contextPrompt += `[Image 1] is the BASE MODEL (Strictly preserve identity/pose/bg).\n`;
          } else {
              contextPrompt = IDENTITY_LOCK_INSTRUCTION + '\n\n';
              contextPrompt += `Task: Fashion Design Synthesis for TOPS.\n`;
          }

          let imgIndex = activeBaseImage ? 2 : 1;

          // Add Outer Refs
          if (outerImages.length > 0) {
              finalImages.push(...outerImages);
              const count = outerImages.length;
              const indices = Array.from({length: count}, (_, i) => imgIndex + i).join(', ');
              contextPrompt += `[Outerwear References]: Use Image(s) ${indices} as Outerwear (e.g., Jacket, Coat, Cardigan). STRICTLY REPLICATE the design, pattern, texture, and length from these images.\n`;
              activeInventory.push('Outerwear');
              
              const analysis = getAnalysis(topsInputs.OUTER.analysisPrompt, 'TOPS_OUTER');
              if (analysis) contextPrompt += `[Outerwear VISUAL ANALYSIS (Deep Vision)]: ${analysis}\n`;
              
              imgIndex += count;
          }

          // Add Inner Refs
          if (innerImages.length > 0) {
              finalImages.push(...innerImages);
              const count = innerImages.length;
              const indices = Array.from({length: count}, (_, i) => imgIndex + i).join(', ');
              contextPrompt += `[Innerwear References]: Use Image(s) ${indices} as Innerwear (e.g., T-shirt, Shirt, Blouse). STRICTLY REPLICATE the design, pattern, texture, and length from these images.\n`;
              activeInventory.push('Innerwear');
              
              const analysis = getAnalysis(topsInputs.INNER.analysisPrompt, 'TOPS_INNER');
              if (analysis) contextPrompt += `[Innerwear VISUAL ANALYSIS (Deep Vision)]: ${analysis}\n`;

              imgIndex += count;
          }

          if (outerImages.length > 0 && innerImages.length > 0) {
              contextPrompt += `\nLAYERING INSTRUCTION: The model should be wearing the [Innerwear] underneath the [Outerwear]. Ensure realistic layering, draping, and interaction between garments.\n`;
          }
          
          contextPrompt += `\nDesign Prompt: ${prompt}`;

      } else if (selectedCategory === 'MIX') {
        // Flatten mixInputs for processing, now including Split Tops AND 3 Accessories
        const mixOrder = [
            { type: 'TOPS (Outerwear)', state: mixInputs.TOPS.OUTER, key: 'MIX_TOPS_OUTER' },
            { type: 'TOPS (Innerwear)', state: mixInputs.TOPS.INNER, key: 'MIX_TOPS_INNER' },
            { type: 'BOTTOMS', state: mixInputs.BOTTOMS, key: 'MIX_BOTTOMS' },
            { type: 'SHOES', state: mixInputs.SHOES, key: 'MIX_SHOES' },
            { type: 'ACCESSORY 1', state: mixInputs.ACCESSORIES.ACC1, key: 'MIX_ACC1' },
            { type: 'ACCESSORY 2', state: mixInputs.ACCESSORIES.ACC2, key: 'MIX_ACC2' },
            { type: 'ACCESSORY 3', state: mixInputs.ACCESSORIES.ACC3, key: 'MIX_ACC3' }
        ];

        finalImages = activeBaseImage ? [activeBaseImage] : [];
        
        let promptBuilder = '';
        if (activeBaseImage) {
            promptBuilder = PRESERVE_BASE_INSTRUCTION + '\n\n';
            promptBuilder += STRICT_INVENTORY_INSTRUCTION + '\n\n';
            promptBuilder += `Task: Complete Outfit Synthesis (Mix & Match).\n`;
            promptBuilder += `[Image 1] is the BASE MODEL. Apply the target items to this model while strictly preserving identity, pose, and background.\n`;
        } else {
            promptBuilder = IDENTITY_LOCK_INSTRUCTION + '\n\n';
            promptBuilder += `Task: Complete Outfit Synthesis (Mix & Match).\nInstruction: Create a cohesive outfit.\n`;
        }
        
        let imgIndex = activeBaseImage ? 2 : 1;
        
        for (const group of mixOrder) {
            const groupImages = [...group.state.mainImages, ...group.state.detailImages];
            if (groupImages.length > 0) {
                finalImages.push(...groupImages);
                const count = groupImages.length;
                const indices = Array.from({length: count}, (_, i) => imgIndex + i).join(', ');
                promptBuilder += `- Use Image(s) ${indices} as STRICT source for ${group.type}. Copy exact details (pattern, color, shape, length).\n`;
                activeInventory.push(group.type);
                
                const analysis = getAnalysis(group.state.analysisPrompt, group.key);
                if (analysis) promptBuilder += `  [${group.type} VISUAL ANALYSIS (Deep Vision)]: ${analysis}\n`;
                
                imgIndex += count;
            }
        }
        
        // Add layering instruction if both Tops Outer and Inner are present
        if (mixInputs.TOPS.OUTER.mainImages.length > 0 && mixInputs.TOPS.INNER.mainImages.length > 0) {
            promptBuilder += `\nLAYERING INSTRUCTION for TOPS: The model should be wearing the [Innerwear] underneath the [Outerwear]. Ensure realistic layering, draping, and interaction between garments.\n`;
        }

        contextPrompt = promptBuilder + `\nDesign Prompt: ${prompt}`;
      } else {
        const catImages = [...categoryInputs[selectedCategory].mainImages, ...categoryInputs[selectedCategory].detailImages];
        finalImages = activeBaseImage ? [activeBaseImage, ...catImages] : catImages;
        
        if (activeBaseImage) {
            contextPrompt = PRESERVE_BASE_INSTRUCTION + '\n\n';
            contextPrompt += STRICT_INVENTORY_INSTRUCTION + '\n\n';
            contextPrompt += `Task: Virtual Try-On for Category: ${selectedCategory}.\n`;
            contextPrompt += `[Image 1] is the BASE MODEL (Strictly preserve identity/pose/bg).\n`;
            if (catImages.length > 0) {
                contextPrompt += `[Subsequent Images] are the CLOTHING REFERENCES. Apply this clothing to the Base Model. STRICTLY REPLICATE the design, pattern, texture, and length.\n`;
                activeInventory.push(selectedCategory);
            }
        } else {
            contextPrompt = IDENTITY_LOCK_INSTRUCTION + '\n\n';
            contextPrompt += `Task: Fashion Design Synthesis. Category: ${selectedCategory}. ${catImages.length > 0 ? 'Subsequent images are STRICT Reference.' : ''}`;
            if (catImages.length > 0) {
                contextPrompt += `\nCRITICAL: The generated outfit MUST match the [Reference Images] exactly in terms of pattern, color, and design details. Do not hallucinate.`;
            }
        }
        
        contextPrompt += `\nPrompt: ${prompt}`;
        
        const analysis = getAnalysis(categoryInputs[selectedCategory].analysisPrompt, selectedCategory);
        if (analysis) contextPrompt += `\n[VISUAL ANALYSIS (Deep Vision)]: ${analysis}`;
      }

      // --- Anti-Hallucination Inventory Check ---
      const headwearKeywords = ['hat', 'cap', 'beanie', 'beret', 'headwear', 'helmet', 'mask', 'hood', 'hairband', '모자', '비니'];
      const userWantsHeadwear = headwearKeywords.some(kw => prompt.toLowerCase().includes(kw));
      const refHasHeadwear = activeInventory.some(i => i.toLowerCase().includes('accessory')); // Weak check, but generally accessories might be headwear

      if (!userWantsHeadwear && !refHasHeadwear) {
          contextPrompt += `\n\n[INVENTORY CHECK: HEADWEAR]
          - The user has NOT provided a reference or prompt for Headwear (Hat/Cap).
          - **ACTION:** DO NOT generate any new headwear.
          - If the base model is bare-headed, KEEP IT BARE-HEADED.`;
          
          negativePrompt += ", hat, cap, beanie, beret, helmet, sun hat, cowboy hat, baseball cap, headwear";
      }

      const bagKeywords = ['bag', 'purse', 'backpack', 'clutch', 'tote', '가방', '백팩'];
      const userWantsBag = bagKeywords.some(kw => prompt.toLowerCase().includes(kw));
      if (!userWantsBag && !refHasHeadwear) { // 'Accessory' could be a bag too
          contextPrompt += `\n\n[INVENTORY CHECK: BAGS]
          - The user has NOT provided a reference or prompt for Bags.
          - **ACTION:** DO NOT generate any bags, purses, or backpacks.`;
          negativePrompt += ", bag, backpack, purse, clutch, handbag, holding bag";
      }

      // Inject Sneaker Anatomy Knowledge if Shoes are involved
      if (selectedCategory === 'SHOES' || (selectedCategory === 'MIX' && mixInputs.SHOES.mainImages.length > 0)) {
          contextPrompt += `\n\n${SNEAKER_DEFINITIONS}\n참고: 위 용어에 정의된 신발의 각 부위별 디테일(색상, 소재, 패턴)을 정확하게 구현하세요.`;
      }

      // ------------------------------------------
      // Environment & Atmosphere Settings Logic
      // ------------------------------------------
      let envSettings: EnvironmentSettings | null = null;
      if (selectedCategory === 'TOPS') envSettings = topsInputs;
      else if (selectedCategory === 'MIX') envSettings = mixInputs;
      else envSettings = categoryInputs[selectedCategory];

      // FORCE PRO MODEL ALWAYS AS INDICATED BY BUTTON
      const forcePro = true; 
      
      // 1. Background Logic
      if (envSettings?.changeBackground) {
          let bgInstruction = `\n\n[PRIORITY OVERRIDE: BACKGROUND REPLACEMENT] 
          YOU MUST IGNORE THE ORIGINAL BACKGROUND. 
          The instruction to 'preserve base model background' is NULL AND VOID for this task.
          
          COMPOSITION TASK: Seamlessly integrate the character into the new background. `;
          
          if (envSettings.backgroundPrompt) {
              bgInstruction += `Environment description: ${envSettings.backgroundPrompt}. `;
          }
          
          if (envSettings.backgroundImage) {
              finalImages.push(envSettings.backgroundImage);
              const ordinal = finalImages.length; // 1-based index
              bgInstruction += `Use Image ${ordinal} as the background environment. `;
          }

          bgInstruction += `\nCRITICAL: Adjust the character's lighting, shadows, reflection, and color tone to MATCH the new background perfectly. The result must look like a single photograph taken in that location.`;
          contextPrompt += bgInstruction;
          
          // Add negative prompts to remove studio/plain backgrounds if user wants a change
          negativePrompt += ", original background, studio background, plain background, white background, grey background, simple background";
      }

      // 2. Color/Tone Logic
      if (envSettings?.changeColor) {
           let colorInstruction = `\n\n[PRIORITY OVERRIDE: ATMOSPHERE] 
           YOU MUST CHANGE THE LIGHTING AND TONE.
           COLOR GRADING: Apply specific lighting and color tone. `;
           
           if (envSettings.colorPrompt) {
               colorInstruction += `Target Atmosphere: ${envSettings.colorPrompt}. `;
           }

           if (envSettings.colorImage) {
               finalImages.push(envSettings.colorImage);
               const ordinal = finalImages.length; // 1-based index
               colorInstruction += `Use Image ${ordinal} as the REFERENCE for Color Palette, Lighting Style, and Overall Mood. Do not copy the objects in this image, only the VIBE and LIGHTING. `;
           }
           
           if (!envSettings.changeBackground) {
               colorInstruction += `\nKeep the original background structure but RE-LIGHT the scene to match this new atmosphere.`;
           } else {
               colorInstruction += `\nApply this color grading on top of the newly composed background.`;
           }
           
           contextPrompt += colorInstruction;
      }

      // ADDED: Hybrid Fidelity Protocol (Strict Outfit Protection during High Temp generation)
      if (envSettings?.changeBackground || envSettings?.changeColor) {
          contextPrompt += `
\n[HYBRID FIDELITY PROTOCOL]
- GLOBAL CREATIVITY is enabled for Background/Lighting ONLY.
- LOCAL FIDELITY for the Outfit must remain at 100%.
- Do NOT let the high temperature setting affect the garment details.
- Lock the clothing pixels. Change only the environment pixels.
`;
      }

      // Inject Chain of Thought for Logo/Text Fidelity (Re-emphasized)
      contextPrompt += `\n\n[Chain of Thought Process]
Step 1: REVIEW VISUAL ANALYSIS.
   - Use the [VISUAL ANALYSIS] text provided above to understand the garment's structure, logo placement, and text content.
   - Explicitly map these features to the Base Model's body.

Step 2: MAPPING & WARPING.
   - Treat the clothing reference as a texture. Warp it to fit the model's pose.
   - Ensure logos and text follow the curvature of the body.

Step 3: GENERATE.
   - Apply the analyzed elements onto the base model.
   - VERIFY: Does the generated logo match the analysis? If not, correct it.
`;
      // --- [START] ADDED LOGIC: Pose Preservation Check ---
      const motionKeywords = [
        "standing", "sitting", "walking", "running", "posing", "jumping", 
        "looking", "gesture", "view", "angle", "dynamic", "action", 
        "달리는", "앉아", "서있는", "포즈", "자세", "걷는", "바라보는"
      ];

      const isMotionRequested = motionKeywords.some(k => prompt.toLowerCase().includes(k));
      const isEmptyPrompt = !prompt || prompt.trim().length === 0;

      // Logic: If Base Model exists AND (Empty Prompt OR No Motion Requested)
      if (activeBaseImage && (isEmptyPrompt || !isMotionRequested)) {
           const poseConstraint = `
    [CRITICAL: DIGITAL MANNEQUIN MODE - ABSOLUTE POSE FREEZE]
    - The user provided a BASE MODEL and NO specific pose instruction.
    - **ACTION: FREEZE THE POSE 100%.**
    - Treat the Base Model as a rigid 3D mesh.
    - Do NOT rotate the camera. Do NOT zoom in/out.
    - Do NOT move the head, arms, hands, or legs even by a millimeter.
    - Do NOT change the facial expression.
    - Your SOLE task is to texture-map the new clothing onto this EXISTING geometry.
    - IF YOU CHANGE THE POSE, THE GENERATION IS A FAILURE.
    `;
           contextPrompt += poseConstraint;
           negativePrompt += ", changing pose, moving arms, different angle, new posture, dynamic pose, action shot, walking, running, looking away, head turn, body morphing, changing background, different face, shifting weight, new stance";
      }
      // --- [END] ADDED LOGIC ---

      // Global Quality & Negative Prompt Injection
      contextPrompt += `\n\nQUALITY ASSURANCE: ${HIGH_QUALITY_PROMPT}`;
      contextPrompt += `\nNEGATIVE PROMPT: ${negativePrompt}`;

      await generateFashionImages(
          contextPrompt, finalImages, generationCount, resolution, 
          async (url) => { 
              completedCount++; setProgress(Math.round((completedCount / generationCount) * 100)); 
              
              const stableId = crypto.randomUUID();
              // Frontend First: Create Blob URL immediately
              const blobUrl = base64ToBlobUrl(url);

              const newImg: GeneratedImage = { 
                  id: stableId, // Local ID
                  url: blobUrl || url, // Use blob for immediate display
                  prompt, 
                  resolution, 
                  category: selectedCategory, 
                  timestamp: Date.now(),
                  // Optimistic UI flags
                  isUploading: true,
                  tempUrl: blobUrl || undefined
              };
              
              // Add to history instantly
              setHistory(prev => ({ ...prev, [selectedCategory]: [newImg, ...prev[selectedCategory]].slice(0, 16) }));
              if (completedCount === 1) {
                  updateSelection(newImg.url);
                  setIsCompareMode(false); // Ensure regular view on new generation
              }

              // --- Background Save to LocalDB ---
              if (userId) {
                  saveImageToLocal(userId, {
                      ...newImg,
                      category: selectedCategory as any,
                      prompt: prompt
                  }, url).then((result) => {
                      if (result) {
                         // On success, update with real ID and storagePath
                         setHistory(prev => ({
                             ...prev,
                             [selectedCategory]: prev[selectedCategory].map(item => 
                                 item.id === stableId ? { 
                                     ...item, 
                                     isUploading: false, 
                                     id: result.id, // Set Server ID
                                     storagePath: result.storagePath 
                                } : item
                             )
                         }));
                      }
                  }).catch(e => {
                      console.error("Auto-save failed", e);
                      // On fail, just remove uploading flag (item remains local)
                      setHistory(prev => ({
                             ...prev,
                             [selectedCategory]: prev[selectedCategory].map(item => 
                                 item.id === stableId ? { ...item, isUploading: false } : item
                             )
                         }));
                  });
              } else {
                  // Guest mode without ID
                  setHistory(prev => ({
                        ...prev,
                        [selectedCategory]: prev[selectedCategory].map(item => 
                            item.id === stableId ? { ...item, isUploading: false } : item
                        )
                    }));
              }
              // -----------------------------
          }, 
          abortControllerRef.current.signal,
          forcePro
      );
      setStatus(AppStatus.SUCCESS); setProgress(100);
    } catch (error: any) { 
        if (error.message !== "Operation cancelled by user") { 
            const msg = error instanceof Error ? error.message : String(error);
            setErrorMsg(msg || "Failed to generate."); 
            setStatus(AppStatus.ERROR); 
        } 
    } finally { abortControllerRef.current = null; }
  };

  const renderReferenceSection = (title: string, mainImages: ReferenceImage[], detailImages: ReferenceImage[], analysisText: string, onMainChange: (imgs: ReferenceImage[]) => void, onDetailChange: (imgs: ReferenceImage[]) => void, onAnalysisChange: (txt: string) => void, sectionId: string, onClear?: () => void) => {
      const showDetail = mainImages.length > 0;
      const showAnalysis = mainImages.length > 0;
      const isThisAnalyzing = analyzingCategory === sectionId;

      return (
          <div className="space-y-4 animate-in fade-in duration-300 relative bg-slate-900/20 p-2 rounded-lg border border-slate-800/50">
              <div className="flex items-center justify-between px-1 mb-2">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{title}</span>
                   {onClear && (
                       <button 
                           type="button" 
                           onClick={(e) => { 
                               e.preventDefault(); 
                               e.stopPropagation(); 
                               console.log("Clear button clicked for", sectionId);
                               onClear(); 
                           }} 
                           className="text-slate-500 hover:text-red-400 transition-colors p-1.5 rounded-full hover:bg-slate-800 active:bg-slate-700 z-10 relative group" 
                           title="Clear All Inputs"
                       >
                           <Trash2 size={15} className="group-active:scale-95 transition-transform" />
                       </button>
                   )}
              </div>
              <ReferenceUploader title="Main Image" images={mainImages} onImagesChange={onMainChange} maxImages={1} />
              {showDetail && (<div className="animate-in slide-in-from-top-2 fade-in duration-300"><ReferenceUploader title="Detail Image" images={detailImages} onImagesChange={onDetailChange} /></div>)}
              {showAnalysis && (
                  <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700 animate-in fade-in duration-300">
                      <div className="flex justify-between items-center mb-2">
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Sparkles size={10} /> Deep Vision Analysis</span>
                           <button onClick={() => handleClothingAnalysis(mainImages, detailImages, onAnalysisChange, sectionId)} disabled={isThisAnalyzing} className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors ${isThisAnalyzing ? 'bg-purple-900 text-purple-300' : 'bg-slate-700 hover:bg-blue-600 text-white'}`}>{isThisAnalyzing ? <Loader2 size={10} className="animate-spin" /> : <ScanSearch size={10} />}{isThisAnalyzing ? 'Scanning...' : 'Scan Image'}</button>
                      </div>
                      <textarea value={analysisText} onChange={(e) => onAnalysisChange(e.target.value)} placeholder="Pixel-level analysis result will appear here..." className="w-full h-20 bg-slate-800 border border-slate-600 rounded p-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 resize-none custom-scrollbar" />
                  </div>
              )}
          </div>
      );
  };

  const renderEnvironmentSection = (settings: EnvironmentSettings, updateSettings: (field: keyof EnvironmentSettings, value: any) => void) => {
    return (
        <div className="pt-4 border-t border-slate-700 flex flex-col gap-2">
             {/* 1. Background Settings */}
             <div className="bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
                <div 
                    onClick={() => updateSettings('changeBackground', !settings.changeBackground)}
                    className="flex items-center gap-2 cursor-pointer p-3 select-none hover:bg-slate-800 transition-colors"
                >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${settings.changeBackground ? 'bg-blue-600 border-blue-500' : 'bg-slate-800 border-slate-600'}`}>
                        {settings.changeBackground && <Check size={12} className="text-white" />}
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${settings.changeBackground ? 'text-blue-400' : 'text-slate-400'}`}>
                        Background Composition
                    </span>
                </div>
                
                {settings.changeBackground && (
                    <div className="p-3 pt-0 space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <div className="border-t border-slate-700/50 pt-3">
                            <label className="text-xs font-semibold text-slate-500 mb-2 block">Background Reference (Optional)</label>
                            <ReferenceUploader 
                                title="BG Image" 
                                images={settings.backgroundImage ? [settings.backgroundImage] : []} 
                                onImagesChange={(imgs) => updateSettings('backgroundImage', imgs.length > 0 ? imgs[0] : null)}
                                maxImages={1}
                            />
                        </div>

                        {settings.backgroundImage && (
                            <div className="flex justify-end">
                                <button
                                    onClick={() => handleBackgroundAnalysis(settings.backgroundImage!, (txt) => updateSettings('backgroundPrompt', txt))}
                                    disabled={isAnalyzingBackground}
                                    className="text-[10px] bg-slate-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isAnalyzingBackground ? <Loader2 size={12} className="animate-spin" /> : <ScanSearch size={12} />}
                                    {isAnalyzingBackground ? 'Analyzing...' : 'Analyze Background'}
                                </button>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Background Prompt</label>
                            <textarea 
                                placeholder="e.g. Neon city street at night, Cyberpunk"
                                value={settings.backgroundPrompt} 
                                onChange={(e) => updateSettings('backgroundPrompt', e.target.value)}
                                className="w-full h-20 bg-slate-800 border border-slate-600 rounded p-2 text-xs focus:border-blue-500 outline-none resize-none"
                            />
                        </div>
                    </div>
                )}
             </div>

             {/* 2. Color/Tone Settings */}
             <div className="bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
                <div 
                    onClick={() => updateSettings('changeColor', !settings.changeColor)}
                    className="flex items-center gap-2 cursor-pointer p-3 select-none hover:bg-slate-800 transition-colors"
                >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${settings.changeColor ? 'bg-purple-600 border-purple-500' : 'bg-slate-800 border-slate-600'}`}>
                        {settings.changeColor && <Check size={12} className="text-white" />}
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${settings.changeColor ? 'text-purple-400' : 'text-slate-400'}`}>
                        Atmosphere & Tone
                    </span>
                </div>
                
                {settings.changeColor && (
                    <div className="p-3 pt-0 space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <div className="border-t border-slate-700/50 pt-3">
                            <label className="text-xs font-semibold text-slate-500 mb-2 block">Color/Mood Reference</label>
                            <ReferenceUploader 
                                title="Mood Image" 
                                images={settings.colorImage ? [settings.colorImage] : []} 
                                onImagesChange={(imgs) => updateSettings('colorImage', imgs.length > 0 ? imgs[0] : null)}
                                maxImages={1}
                            />
                        </div>

                        {settings.colorImage && (
                            <div className="flex justify-end">
                                <button
                                    onClick={() => handleColorAnalysis(settings.colorImage!, (txt) => updateSettings('colorPrompt', txt))}
                                    disabled={isAnalyzingColor}
                                    className="text-[10px] bg-slate-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isAnalyzingColor ? <Loader2 size={12} className="animate-spin" /> : <Palette size={12} />}
                                    {isAnalyzingColor ? 'Analyzing...' : 'Analyze Tone'}
                                </button>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Atmosphere Prompt</label>
                            <textarea 
                                placeholder="e.g. Cinematic lighting, Warm Golden Hour, Vintage Film Grain, High Contrast"
                                value={settings.colorPrompt} 
                                onChange={(e) => updateSettings('colorPrompt', e.target.value)}
                                className="w-full h-20 bg-slate-800 border border-slate-600 rounded p-2 text-xs focus:border-purple-500 outline-none resize-none"
                            />
                        </div>
                    </div>
                )}
             </div>
         </div>
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#0f172a] text-slate-200 font-sans">
      <div className="flex w-full h-full">
        <Sidebar selectedCategory={selectedCategory} onSelectCategory={handleCategorySelect} onUploadBaseImage={handleBaseImageUpload} hasBaseImage={!!activeBaseImage} userId={userId} />
        {selectedCategory === 'ANALYSIS' ? (
             <div className="flex-1 bg-[#020617] flex h-full overflow-hidden">
                 {/* Inner Sidebar for Deep Scan Tabs */}
                 <div className="w-64 bg-[#1e293b] border-r border-slate-700 flex flex-col p-4 gap-2 shadow-xl z-10">
                     <div className="mb-4">
                        <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 flex items-center gap-2">
                            <ScanSearch size={20} className="text-blue-400" /> Deep Scan
                        </h2>
                        <p className="text-[10px] text-slate-500 mt-1">Select an analysis mode to extract professional prompts.</p>
                     </div>
                     
                     {[
                        { id: 'PRODUCT', label: 'Product / Texture', icon: Package, desc: '원단, 소재, 패턴 및 디테일 정밀 분석' },
                        { id: 'MODEL', label: 'Model / Traits', icon: UserCheck, desc: '얼굴, 체형, 인종 등 인물 특성 분석' },
                        { id: 'POSE', label: 'Pose / Angle', icon: Move, desc: '포즈, 제스처, 카메라 앵글 및 구도' },
                        { id: 'BACKGROUND', label: 'Background', icon: ImageIconLucide, desc: '장소, 건축 양식, 시간대 및 배경 요소' },
                        { id: 'LIGHTING', label: 'Lighting / Mood', icon: Sun, desc: '조명 스타일, 색감, 톤앤매너 분위기' },
                     ].map((tab) => {
                         const isActive = activeDeepScanTab === tab.id;
                         let activeContainerClass = '';
                         let activeIconClass = '';

                         if (isActive) {
                             switch(tab.id) {
                                 case 'PRODUCT': 
                                    activeContainerClass = 'bg-emerald-600/20 border border-emerald-500/50 text-emerald-200';
                                    activeIconClass = 'bg-emerald-600 text-white';
                                    break;
                                 case 'MODEL':
                                    activeContainerClass = 'bg-blue-600/20 border border-blue-500/50 text-blue-200';
                                    activeIconClass = 'bg-blue-600 text-white';
                                    break;
                                 case 'POSE':
                                    activeContainerClass = 'bg-purple-600/20 border border-purple-500/50 text-purple-200';
                                    activeIconClass = 'bg-purple-600 text-white';
                                    break;
                                 case 'BACKGROUND':
                                    activeContainerClass = 'bg-amber-600/20 border border-amber-500/50 text-amber-200';
                                    activeIconClass = 'bg-amber-600 text-white';
                                    break;
                                 case 'LIGHTING':
                                    activeContainerClass = 'bg-rose-600/20 border border-rose-500/50 text-rose-200';
                                    activeIconClass = 'bg-rose-600 text-white';
                                    break;
                             }
                         }

                         return (
                         <button
                            key={tab.id}
                            onClick={() => setActiveDeepScanTab(tab.id as DeepScanType)}
                            className={`flex items-center gap-3 p-3 rounded-lg text-left transition-all group ${
                                isActive 
                                ? activeContainerClass 
                                : 'bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent'
                            }`}
                         >
                             <div className={`p-2 rounded-lg ${isActive ? activeIconClass : 'bg-slate-700 text-slate-400 group-hover:bg-slate-600 group-hover:text-white'}`}>
                                 <tab.icon size={18} />
                             </div>
                             <div>
                                 <span className="text-xs font-bold block">{tab.label}</span>
                                 <span className="text-[9px] opacity-70 block">{tab.desc}</span>
                             </div>
                         </button>
                     )})}
                 </div>

                 {/* Main Content Area */}
                 <div className="flex-1 overflow-y-auto p-8 relative">
                     <div className="max-w-4xl mx-auto w-full">
                         <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                             {activeDeepScanTab === 'PRODUCT' && <Package className="text-emerald-400" />}
                             {activeDeepScanTab === 'MODEL' && <UserCheck className="text-blue-400" />}
                             {activeDeepScanTab === 'POSE' && <Move className="text-purple-400" />}
                             {activeDeepScanTab === 'BACKGROUND' && <ImageIconLucide className="text-amber-400" />}
                             {activeDeepScanTab === 'LIGHTING' && <Sun className="text-rose-400" />}
                             
                             {activeDeepScanTab} Analysis
                         </h2>
                         
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                             {/* Left: Input */}
                             <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700 shadow-xl h-fit">
                                 <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Target Image</h3>
                                 <ReferenceUploader 
                                    title="Upload Image" 
                                    images={deepScanData[activeDeepScanTab].image ? [deepScanData[activeDeepScanTab].image!] : []} 
                                    onImagesChange={(imgs) => setDeepScanData(prev => ({
                                        ...prev,
                                        [activeDeepScanTab]: { ...prev[activeDeepScanTab], image: imgs.length > 0 ? imgs[0] : null }
                                    }))} 
                                    maxImages={1}
                                 />
                                 
                                 <div className="mt-6">
                                     <button 
                                        onClick={handleDeepScan} 
                                        disabled={isAnalyzing || !deepScanData[activeDeepScanTab].image} 
                                        className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 
                                            ${!deepScanData[activeDeepScanTab].image 
                                                ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                                                : isAnalyzing 
                                                    ? 'bg-indigo-600 cursor-wait' 
                                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/30'
                                            }`}
                                     >
                                         {isAnalyzing ? (
                                             <><Loader2 className="animate-spin" /> Analyzing...</>
                                         ) : (
                                             <><ScanSearch /> Start {activeDeepScanTab} Scan</>
                                         )}
                                     </button>
                                 </div>
                                 {errorMsg && (
                                     <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-sm text-red-300 flex items-start gap-2">
                                         <AlertCircle size={16} className="mt-0.5" />{errorMsg}
                                     </div>
                                 )}
                             </div>

                             {/* Right: Output */}
                             <div className="flex flex-col gap-4">
                                 {/* English Result */}
                                 <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700 shadow-xl flex flex-col h-full relative group min-h-[200px]">
                                     <div className="flex justify-between items-center mb-3">
                                         <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wider flex items-center gap-2">
                                             🇺🇸 English Prompt (SD Optimized)
                                         </h3>
                                         <button 
                                            onClick={() => deepScanData[activeDeepScanTab].result && copyToClipboard(deepScanData[activeDeepScanTab].result!.english, 'EN')} 
                                            disabled={!deepScanData[activeDeepScanTab].result} 
                                            className="text-xs flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded transition-colors"
                                         >
                                             {copiedField === 'EN' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                             {copiedField === 'EN' ? 'Copied!' : 'Copy'}
                                         </button>
                                     </div>
                                     <div className="flex-1 bg-slate-900/50 rounded-lg p-4 text-sm text-slate-300 leading-relaxed border border-slate-700/50 overflow-y-auto max-h-48 custom-scrollbar font-mono">
                                         {deepScanData[activeDeepScanTab].result 
                                            ? deepScanData[activeDeepScanTab].result!.english 
                                            : <span className="text-slate-600 italic">No analysis data yet...</span>
                                         }
                                     </div>
                                 </div>

                                 {/* Korean Result */}
                                 <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700 shadow-xl flex flex-col h-full relative group min-h-[200px]">
                                     <div className="flex justify-between items-center mb-3">
                                         <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                                             🇰🇷 Korean Analysis (Descriptive)
                                         </h3>
                                         <button 
                                            onClick={() => deepScanData[activeDeepScanTab].result && copyToClipboard(deepScanData[activeDeepScanTab].result!.korean, 'KR')} 
                                            disabled={!deepScanData[activeDeepScanTab].result} 
                                            className="text-xs flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded transition-colors"
                                         >
                                             {copiedField === 'KR' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                             {copiedField === 'KR' ? 'Copied!' : 'Copy'}
                                         </button>
                                     </div>
                                     <div className="flex-1 bg-slate-900/50 rounded-lg p-4 text-sm text-slate-300 leading-relaxed border border-slate-700/50 overflow-y-auto max-h-48 custom-scrollbar">
                                         {deepScanData[activeDeepScanTab].result 
                                            ? deepScanData[activeDeepScanTab].result!.korean 
                                            : <span className="text-slate-600 italic">분석 결과가 여기에 표시됩니다...</span>
                                         }
                                     </div>
                                 </div>
                             </div>
                         </div>
                     </div>
                 </div>
             </div>
        ) : (
            <>
                <div className="flex-1 bg-[#020617] relative overflow-hidden flex flex-col">
                <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                {status === AppStatus.GENERATING && (
                    <>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 z-50"><div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 transition-all duration-300 ease-out" style={{ width: `${Math.max(5, progress)}%` }}></div></div>
                    <div className="absolute bottom-8 right-8 flex items-center gap-4 z-50"><div className="flex items-center gap-1.5 text-slate-400 bg-black/40 px-3 py-1 rounded-full border border-slate-700 backdrop-blur shadow-xl"><Timer size={14} className="text-blue-400 animate-pulse" /><span className="text-sm font-mono text-blue-200">{elapsedTime.toFixed(1)}s</span></div><span className="text-4xl font-bold text-white/10">{progress}%</span></div>
                    <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none z-50"><div className="bg-black/40 backdrop-blur-sm px-4 py-1 rounded-full border border-white/10 flex items-center gap-2"><Loader2 size={12} className="animate-spin text-blue-400" /><span className="text-xs font-medium text-white tracking-wider">GENERATING {resolution} • {progress}%</span></div></div>
                    </>
                )}
                <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
                    <div className="flex gap-2">
                        <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full px-4 py-1.5 flex items-center gap-2 text-xs font-medium text-slate-300 shadow-lg"><span className={`w-2 h-2 rounded-full ${status === AppStatus.GENERATING ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'}`}></span>Mode: {selectedCategory === 'MIX' ? 'Mix & Match' : `${selectedCategory} Synthesis`}</div>
                        {selectedImage && currentImg && (<div className="bg-emerald-900/80 backdrop-blur border border-emerald-700/50 rounded-full px-4 py-1.5 flex items-center gap-2 text-xs font-medium text-emerald-300 shadow-lg"><Sparkles size={12} />{currentImg.resolution || '1K'} Generated</div>)}
                    </div>
                    {activeBaseImage && selectedImage && (
                        <div className="bg-slate-900/90 backdrop-blur border border-slate-600 rounded-lg p-1.5 flex items-center gap-3 pointer-events-auto shadow-xl">
                            <img src={activeBaseImage.url} className="w-8 h-10 object-cover rounded bg-slate-800" alt="Base" />
                            <div className="flex flex-col"><span className="text-[10px] text-slate-400 uppercase">Active Base</span></div>
                            <button onClick={() => { setActiveBaseImage(null); setOriginalBaseImage(null); }} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Clear Base Model"><X size={14} /></button>
                        </div>
                    )}
                </div>
                
                {/* Main Canvas Area */}
                <div className="relative w-full h-full flex items-center justify-center p-8 group/canvas">
                    {selectedImage ? (
                        <>
                            {generatedImages.length > 1 && (<button onClick={(e) => { e.stopPropagation(); handleNavigate('prev'); }} className="absolute left-6 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-md border border-white/10 opacity-0 group-hover/canvas:opacity-100 transition-all transform hover:scale-110 z-30 shadow-lg" title="Previous Result"><ChevronLeft size={24} /></button>)}
                            
                            <div 
                                ref={imageContainerRef} 
                                className={`relative group shadow-2xl shadow-black/80 h-full max-h-[80vh] aspect-[3/4] flex justify-center animate-in fade-in duration-300 bg-[#0f172a] rounded-sm border border-slate-800 overflow-hidden ${isCompareMode && activeBaseImage ? 'cursor-crosshair' : 'cursor-zoom-in'}`} 
                                onMouseMove={isCompareMode && activeBaseImage ? handleImageMouseMove : undefined} 
                                onMouseLeave={() => isCompareMode && activeBaseImage && setSliderPosition(50)}
                                onClick={() => !isCompareMode && setIsZoomModalOpen(true)}
                            >
                                <img src={selectedImage} alt="Selected" className="absolute inset-0 h-full w-full object-contain z-0" />
                                
                                {isCompareMode && activeBaseImage ? (
                                    <>
                                        <div className="absolute inset-0 h-full w-full pointer-events-none z-10 bg-[#0f172a]" style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}>
                                            <img src={activeBaseImage.url} alt="Base Comparison" className="absolute inset-0 h-full w-full object-contain" />
                                            <div className="absolute top-4 left-4 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur border border-white/10">ORIGINAL BASE</div>
                                        </div>
                                        <div className="absolute top-4 right-4 bg-blue-600/80 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur border border-white/10 z-0 transition-opacity" style={{ opacity: sliderPosition > 90 ? 0 : 1 }}>GENERATED RESULT</div>
                                        
                                        {/* Slider Line */}
                                        <div className="absolute top-0 bottom-0 w-0.5 bg-white z-20 shadow-[0_0_15px_rgba(0,0,0,0.8)] flex flex-col justify-center items-center pointer-events-none" style={{ left: `${sliderPosition}%` }}>
                                            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg text-slate-900">
                                                <MoveHorizontal size={16} />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    /* Zoom Hint when not in compare mode */
                                    <div className="absolute inset-0 flex items-end justify-center pb-8 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-black/5">
                                         <div className="bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-full flex items-center gap-2 border border-white/20 shadow-lg">
                                             <ZoomIn size={14} /> Click to Zoom
                                         </div>
                                    </div>
                                )}
                                
                                <div className="absolute top-4 left-4 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!activeBaseImage && (
                                        <button onClick={(e) => { e.stopPropagation(); updateSelection(null); }} className="bg-black/50 hover:bg-black/80 text-white px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-1.5 text-xs transition-colors">
                                            <ChevronLeft size={14} /> Back to Model
                                        </button>
                                    )}
                                </div>
                                
                                <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-auto z-30">
                                    {/* Upscale Buttons - Only for 1K */}
                                    {currentImg?.resolution === '1K' && !isCompareMode && (
                                        <>
                                            <button onClick={(e) => { e.stopPropagation(); handleUpscale('2K'); }} className="px-4 py-2.5 bg-indigo-600/90 text-white rounded-lg hover:bg-indigo-500 transition-colors shadow-lg font-medium flex items-center gap-2 backdrop-blur border border-indigo-400/30" title="Upscale to 2K (Gemini 3.0 Pro)"><ArrowUpCircle size={16} /><span className="text-xs">Upscale 2K</span></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleUpscale('4K'); }} className="px-4 py-2.5 bg-purple-600/90 text-white rounded-lg hover:bg-purple-500 transition-colors shadow-lg font-medium flex items-center gap-2 backdrop-blur border border-purple-400/30" title="Upscale to 4K (Gemini 3.0 Pro)"><Sparkles size={16} /><span className="text-xs">Upscale 4K</span></button>
                                        </>
                                    )}

                                    {activeBaseImage && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setIsCompareMode(!isCompareMode); }} 
                                            className={`px-4 py-2.5 rounded-lg transition-colors shadow-lg font-medium flex items-center gap-2 ${isCompareMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`} 
                                            title="Toggle Compare Mode"
                                        >
                                            <SplitSquareHorizontal size={16} />
                                            <span className="text-xs">{isCompareMode ? 'Exit Compare' : 'Compare vs Base'}</span>
                                        </button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); handleSetGeneratedAsBase(); }} className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors shadow-lg font-medium flex items-center gap-2" title="Use this image as the base model for next steps"><ArrowRightLeft size={16} /><span className="text-xs">Use as Base Model</span></button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDownload(currentImg); }} className="px-4 py-2.5 bg-white text-black rounded-lg hover:bg-slate-200 transition-colors shadow-lg font-medium flex items-center gap-2"><Download size={16} /><span className="text-xs">Save {currentImg?.resolution || '1K'}</span></button>
                                </div>
                            </div>
                            {generatedImages.length > 1 && (<button onClick={(e) => { e.stopPropagation(); handleNavigate('next'); }} className="absolute right-6 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-md border border-white/10 opacity-0 group-hover/canvas:opacity-100 transition-all transform hover:scale-110 z-30 shadow-lg" title="Next Result"><ChevronRight size={24} /></button>)}
                        </>
                    ) : activeBaseImage ? (
                        <div className="relative w-full h-full flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
                            <div className="relative h-full max-h-[85vh] w-full flex items-center justify-center">
                            <img src={activeBaseImage.url} alt="Base Model" className="h-full w-full object-contain drop-shadow-2xl" />
                            <div className="absolute bottom-4 flex flex-col items-center gap-2">
                                <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-sm font-medium border border-white/10 text-white">Current Base Model ({selectedCategory === 'MIX' ? 'Mix' : selectedCategory} Mode)</div>
                                {originalBaseImage && activeBaseImage.id !== originalBaseImage.id && (<button onClick={handleRevertBase} className="flex items-center gap-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-full border border-slate-600 shadow-lg transition-colors"><Undo2 size={12} /> Revert to Original Upload</button>)}
                            </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-slate-600 text-center max-w-md">
                        <div className="w-20 h-20 bg-slate-900 rounded-2xl mx-auto mb-6 flex items-center justify-center border border-slate-800 shadow-xl rotate-3"><Wand2 size={32} className="text-blue-500 opacity-80" /></div>
                        <h2 className="text-xl font-bold text-slate-300 mb-2">Start Your Design</h2>
                        <p className="text-sm text-slate-500 leading-relaxed">1. Upload a <b>Base Model</b> using the person icon.<br/>2. Select your category ({selectedCategory === 'MIX' ? 'Mix' : selectedCategory}).<br/>3. Select Resolution & Add reference images.</p>
                        </div>
                    )}
                </div>
                </div>
                <div className="w-80 bg-[#1e293b] border-l border-slate-700 flex flex-col h-full z-20 shadow-xl shadow-black/50">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="p-5 border-b border-slate-700/50">
                            <div className="flex items-center justify-between mb-3"><h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Settings2 size={12} /> Output Resolution</h2></div>
                            <div className="grid grid-cols-3 gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700">{(['1K', '2K', '4K'] as ImageResolution[]).map((res) => (<button key={res} onClick={() => setResolution(res)} className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-all ${resolution === res ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>{res}</button>))}</div>
                            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">{resolution === '1K' ? "🚀 Nano Banana Pro (Flash): Quick." : "💎 Nano Banana Pro (High Res): Ultra Detail."}</p>
                        </div>

                        <div className="p-5 border-b border-slate-700/50">
                            <div className="mb-4">
                                <label className="text-xs text-slate-500 block mb-1">Quantity</label>
                                <input 
                                    type="range" 
                                    min={1} 
                                    max={4} 
                                    value={quantity} 
                                    onChange={e => setQuantity(Number(e.target.value))} 
                                    className="w-full accent-blue-500" 
                                />
                                <div className="text-right text-xs text-slate-400">{quantity} images</div>
                            </div>
                        </div>
                        <div className="p-5 border-b border-slate-700/50"><div className="flex justify-between items-center mb-3"><h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{selectedCategory === 'MIX' ? 'Mix' : selectedCategory} Prompt</h2></div><textarea className="w-full h-28 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 resize-none placeholder-slate-600 transition-all" placeholder={`Describe the ${selectedCategory.toLowerCase()} design...`} value={prompt} onChange={(e) => updatePrompt(e.target.value)} /></div>
                        
                        <div className="p-5 border-b border-slate-700/50 flex flex-col gap-6">
                        {selectedCategory === 'MIX' ? (
                            <>
                                {/* New Mix Tops Section with Tabs */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between p-1 bg-slate-900 rounded-lg border border-slate-700">
                                        <button 
                                            onClick={() => setActiveMixTopsTab('OUTER')}
                                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activeMixTopsTab === 'OUTER' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Tops (Outer)
                                        </button>
                                        <button 
                                            onClick={() => setActiveMixTopsTab('INNER')}
                                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activeMixTopsTab === 'INNER' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Tops (Inner)
                                        </button>
                                    </div>
                                    {activeMixTopsTab === 'OUTER' ? (
                                        renderReferenceSection('Tops (Outer)', mixInputs.TOPS.OUTER.mainImages, mixInputs.TOPS.OUTER.detailImages, mixInputs.TOPS.OUTER.analysisPrompt, 
                                            (imgs) => updateMixImages('TOPS', 'mainImages', imgs, 'OUTER'), 
                                            (imgs) => updateMixImages('TOPS', 'detailImages', imgs, 'OUTER'), 
                                            (txt) => updateMixAnalysis('TOPS', txt, 'OUTER'), 'MIX_TOPS_OUTER', () => handleClearSection('MIX', 'TOPS', 'OUTER'))
                                    ) : (
                                        renderReferenceSection('Tops (Inner)', mixInputs.TOPS.INNER.mainImages, mixInputs.TOPS.INNER.detailImages, mixInputs.TOPS.INNER.analysisPrompt, 
                                            (imgs) => updateMixImages('TOPS', 'mainImages', imgs, 'INNER'), 
                                            (imgs) => updateMixImages('TOPS', 'detailImages', imgs, 'INNER'), 
                                            (txt) => updateMixAnalysis('TOPS', txt, 'INNER'), 'MIX_TOPS_INNER', () => handleClearSection('MIX', 'TOPS', 'INNER'))
                                    )}
                                </div>

                                {renderReferenceSection('Bottoms', mixInputs.BOTTOMS.mainImages, mixInputs.BOTTOMS.detailImages, mixInputs.BOTTOMS.analysisPrompt, (imgs) => updateMixImages('BOTTOMS', 'mainImages', imgs), (imgs) => updateMixImages('BOTTOMS', 'detailImages', imgs), (txt) => updateMixAnalysis('BOTTOMS', txt), 'MIX_BOTTOMS', () => handleClearSection('MIX', 'BOTTOMS'))}
                                {renderReferenceSection('Shoes', mixInputs.SHOES.mainImages, mixInputs.SHOES.detailImages, mixInputs.SHOES.analysisPrompt, (imgs) => updateMixImages('SHOES', 'mainImages', imgs), (imgs) => updateMixImages('SHOES', 'detailImages', imgs), (txt) => updateMixAnalysis('SHOES', txt), 'MIX_SHOES', () => handleClearSection('MIX', 'SHOES'))}
                                
                                {/* New Mix Accessories Section with Tabs for 3 items */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between p-1 bg-slate-900 rounded-lg border border-slate-700">
                                        <button 
                                            onClick={() => setActiveMixAccTab('ACC1')}
                                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activeMixAccTab === 'ACC1' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Acc 1
                                        </button>
                                        <button 
                                            onClick={() => setActiveMixAccTab('ACC2')}
                                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activeMixAccTab === 'ACC2' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Acc 2
                                        </button>
                                        <button 
                                            onClick={() => setActiveMixAccTab('ACC3')}
                                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activeMixAccTab === 'ACC3' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Acc 3
                                        </button>
                                    </div>
                                    {activeMixAccTab === 'ACC1' && renderReferenceSection('Accessory 1', mixInputs.ACCESSORIES.ACC1.mainImages, mixInputs.ACCESSORIES.ACC1.detailImages, mixInputs.ACCESSORIES.ACC1.analysisPrompt, 
                                        (imgs) => updateMixImages('ACCESSORIES', 'mainImages', imgs, 'ACC1'), 
                                        (imgs) => updateMixImages('ACCESSORIES', 'detailImages', imgs, 'ACC1'), 
                                        (txt) => updateMixAnalysis('ACCESSORIES', txt, 'ACC1'), 'MIX_ACC1', () => handleClearSection('MIX', 'ACCESSORIES', 'ACC1'))}
                                    {activeMixAccTab === 'ACC2' && renderReferenceSection('Accessory 2', mixInputs.ACCESSORIES.ACC2.mainImages, mixInputs.ACCESSORIES.ACC2.detailImages, mixInputs.ACCESSORIES.ACC2.analysisPrompt, 
                                        (imgs) => updateMixImages('ACCESSORIES', 'mainImages', imgs, 'ACC2'), 
                                        (imgs) => updateMixImages('ACCESSORIES', 'detailImages', imgs, 'ACC2'), 
                                        (txt) => updateMixAnalysis('ACCESSORIES', txt, 'ACC2'), 'MIX_ACC2', () => handleClearSection('MIX', 'ACCESSORIES', 'ACC2'))}
                                    {activeMixAccTab === 'ACC3' && renderReferenceSection('Accessory 3', mixInputs.ACCESSORIES.ACC3.mainImages, mixInputs.ACCESSORIES.ACC3.detailImages, mixInputs.ACCESSORIES.ACC3.analysisPrompt, 
                                        (imgs) => updateMixImages('ACCESSORIES', 'mainImages', imgs, 'ACC3'), 
                                        (imgs) => updateMixImages('ACCESSORIES', 'detailImages', imgs, 'ACC3'), 
                                        (txt) => updateMixAnalysis('ACCESSORIES', txt, 'ACC3'), 'MIX_ACC3', () => handleClearSection('MIX', 'ACCESSORIES', 'ACC3'))}
                                </div>
                                
                                {renderEnvironmentSection(mixInputs, (field, value) => updateEnvironmentSettings('MIX', field, value))}
                            </>
                        ) : selectedCategory === 'TOPS' ? (
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between p-1 bg-slate-900 rounded-lg border border-slate-700">
                                    <button 
                                        onClick={() => setActiveTopsTab('OUTER')}
                                        className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activeTopsTab === 'OUTER' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Outerwear
                                    </button>
                                    <button 
                                        onClick={() => setActiveTopsTab('INNER')}
                                        className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activeTopsTab === 'INNER' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Innerwear
                                    </button>
                                </div>
                                {activeTopsTab === 'OUTER' ? (
                                    renderReferenceSection('Outerwear', topsInputs.OUTER.mainImages, topsInputs.OUTER.detailImages, topsInputs.OUTER.analysisPrompt, 
                                        (imgs) => updateTopsImages('OUTER', 'mainImages', imgs), 
                                        (imgs) => updateTopsImages('OUTER', 'detailImages', imgs), 
                                        (txt) => updateTopsAnalysis('OUTER', txt), 'TOPS_OUTER', () => handleClearSection('TOPS', 'OUTER'))
                                ) : (
                                    renderReferenceSection('Innerwear', topsInputs.INNER.mainImages, topsInputs.INNER.detailImages, topsInputs.INNER.analysisPrompt, 
                                        (imgs) => updateTopsImages('INNER', 'mainImages', imgs), 
                                        (imgs) => updateTopsImages('INNER', 'detailImages', imgs), 
                                        (txt) => updateTopsAnalysis('INNER', txt), 'TOPS_INNER', () => handleClearSection('TOPS', 'INNER'))
                                )}
                                {renderEnvironmentSection(topsInputs, (field, value) => updateEnvironmentSettings('TOPS', field, value))}
                            </div>
                        ) : (
                            <>
                            {renderReferenceSection('Reference', categoryInputs[selectedCategory].mainImages, categoryInputs[selectedCategory].detailImages, categoryInputs[selectedCategory].analysisPrompt, (imgs) => updateCategoryImages('mainImages', imgs), (imgs) => updateCategoryImages('detailImages', imgs), (txt) => updateCategoryAnalysis(txt), selectedCategory, () => handleClearSection('CATEGORY', selectedCategory))}
                            {renderEnvironmentSection(categoryInputs[selectedCategory], (field, value) => updateEnvironmentSettings(selectedCategory, field, value))}
                            </>
                        )}
                        </div>

                        <div className="p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    {selectedCategory === 'MIX' ? 'Mix' : selectedCategory} History
                                </h3>
                                {/* Selection Controls */}
                                 {generatedImages.length > 0 && (
                                     <div className="flex items-center gap-2">
                                         {isSelectionMode ? (
                                             <>
                                                <span className="text-xs font-bold text-blue-400 mr-2">{selectedIds.size} Selected</span>
                                                <button onClick={handleSelectAll} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 border border-slate-600">All</button>
                                                <button onClick={handleDeselectAll} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 border border-slate-600">None</button>
                                                <button onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }} className="p-1 hover:bg-slate-700 rounded-full text-slate-400"><X size={16} /></button>
                                             </>
                                         ) : (
                                             <button 
                                                onClick={() => setIsSelectionMode(true)}
                                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-2 transition-colors border border-slate-700"
                                             >
                                                <CheckSquare size={14} /> Select
                                             </button>
                                         )}
                                     </div>
                                 )}
                            </div>
                            <span className="text-[10px] text-slate-600 block mb-2 text-right">
                                {displayedHistory.length}/{generatedImages.length}
                            </span>

                        {generatedImages.length === 0 ? (
                            <div className="h-24 border border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 text-xs text-center p-2">
                                No generations yet
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-2">
                                    {displayedHistory.map((img) => {
                                        const isSelected = selectedIds.has(img.id);
                                        return (
                                        <div 
                                            key={img.id} 
                                            onClick={isSelectionMode ? () => toggleSelection(img.id) : () => updateSelection(img.url)} 
                                            className={`aspect-[3/4] bg-slate-800 rounded-lg overflow-hidden cursor-pointer border-2 transition-all relative group 
                                                ${isSelected 
                                                    ? 'border-blue-500 ring-2 ring-blue-500/20' 
                                                    : (selectedImage === img.url && !isSelectionMode
                                                        ? 'border-blue-500 ring-2 ring-blue-500/20' 
                                                        : 'border-transparent hover:border-slate-600')
                                                }
                                            `}
                                        >
                                            {/* Prefer Blob URL (tempUrl) for instant display */}
                                            <img src={img.tempUrl || img.url} alt="Result" className="w-full h-full object-cover" />
                                            
                                            {/* Resolution Badge - Semi transparent, Top Left to match ModelGen style */}
                                            {img.resolution && img.resolution !== '1K' && (
                                                <div className="absolute top-2 left-2 bg-black/30 text-white text-[8px] px-1.5 py-0.5 rounded backdrop-blur-md border border-white/10 z-10">
                                                    {img.resolution}
                                                </div>
                                            )}
                                            
                                            {selectedImage === img.url && !isSelectionMode && (<div className="absolute inset-0 bg-blue-500/10 pointer-events-none"></div>)}
                                            
                                            {/* Selection Checkbox Overlay */}
                                            {isSelectionMode && (
                                                <div className="absolute top-2 left-2 z-50">
                                                    <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors shadow-sm ${isSelected ? 'bg-blue-600 border-blue-500' : 'bg-black/50 border-white/30 backdrop-blur'}`}>
                                                        {isSelected && <CheckSquare size={14} className="text-white" />}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Right Side Vertical Action Stack (Last Child for Z-Index Dominance) */}
                                            <div 
                                                className="absolute top-2 right-2 z-[100] flex flex-col gap-2"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                            >
                                                {/* Uploading Indicator */}
                                                {img.isUploading && (
                                                    <div className="p-2 bg-blue-600/80 text-white rounded-full backdrop-blur-md shadow-lg flex items-center justify-center animate-pulse" title="Syncing to Cloud">
                                                        <CloudUpload size={14} />
                                                    </div>
                                                )}

                                                {!isSelectionMode && (
                                                    <>
                                                        {/* Save Button */}
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => { 
                                                                e.preventDefault(); 
                                                                e.stopPropagation(); 
                                                                handleDownload(img); 
                                                            }}
                                                            className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-opacity opacity-0 group-hover:opacity-100 cursor-pointer shadow-lg pointer-events-auto"
                                                            title="Save Image"
                                                        >
                                                            <Download size={14} className="pointer-events-none" />
                                                        </button>

                                                        {/* Delete Button */}
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => { 
                                                                e.preventDefault(); 
                                                                e.stopPropagation(); 
                                                                handleDeleteItem(img.id); 
                                                            }}
                                                            // Allow delete even during upload (fire and forget)
                                                            className={`p-2 bg-black/60 hover:bg-red-600 text-white rounded-full backdrop-blur-md transition-opacity opacity-0 group-hover:opacity-100 cursor-pointer shadow-lg pointer-events-auto`}
                                                            title="Delete Image"
                                                        >
                                                            <Trash2 size={14} className="pointer-events-none" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                                {totalPages > 1 && (
                                    <div className="flex justify-center items-center gap-2 mt-4">
                                        <button onClick={() => handlePageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-400 transition-colors"><ChevronLeft size={16} /></button>
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (<button key={p} onClick={() => handlePageChange(p)} className={`w-6 h-6 rounded text-xs font-medium flex items-center justify-center transition-colors ${currentPage === p ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>{p}</button>))}
                                        <button onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-400 transition-colors"><ChevronRight size={16} /></button>
                                    </div>
                                )}
                            </>
                        )}
                        </div>
                    </div>
                    <div className="p-5 border-t border-slate-700 bg-[#1e293b] z-20">
                        {status === AppStatus.GENERATING ? (
                            <button onClick={handleCancelGeneration} className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg bg-red-900/80 hover:bg-red-800 text-red-100 border border-red-700/50"><Square size={16} fill="currentColor" /> STOP GENERATION</button>
                        ) : (
                            <button onClick={handleGenerate} className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/30 hover:shadow-blue-900/50 hover:-translate-y-0.5"><Wand2 size={18} /> GENERATE {quantity} PRO</button>
                        )}
                        {errorMsg && (<div className="mt-3 p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-xs text-red-300 flex items-start gap-2"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{errorMsg}</div>)}
                    </div>
                </div>
            </>
        )}
      </div>

      {/* Full Screen Zoom Modal */}
      {isZoomModalOpen && selectedImage && (
          <div 
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden select-none"
            onClick={() => setIsZoomModalOpen(false)}
            onWheel={(e) => {
                e.stopPropagation();
                // Normalize zoom speed
                const delta = e.deltaY > 0 ? -0.2 : 0.2;
                setZoomLevel(prev => Math.min(10, Math.max(0.5, prev + delta)));
            }}
            onMouseDown={(e) => {
                if (e.button !== 0) return; // Only left click
                setIsDragging(true);
                setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
            }}
            onMouseMove={(e) => {
                if (!isDragging) return;
                setPanOffset({
                    x: e.clientX - dragStart.x,
                    y: e.clientY - dragStart.y
                });
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
              <div className="min-h-full min-w-full flex items-center justify-center p-8" onClick={() => setIsZoomModalOpen(false)}>
                   <div className="relative" onClick={(e) => e.stopPropagation()}>
                       <img 
                            src={selectedImage} 
                            alt="Full View" 
                            style={{ 
                                height: `${zoomLevel * 85}vh`, 
                                maxWidth: 'none',
                                transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                                cursor: isDragging ? 'grabbing' : 'grab'
                            }}
                            className="shadow-2xl rounded-lg transition-transform duration-75 ease-out"
                            draggable={false}
                        />
                        {/* Simple Close Button for accessibility */}
                        <button 
                            onClick={() => setIsZoomModalOpen(false)}
                            className="absolute -top-4 -right-4 bg-red-500 text-white p-2 rounded-full shadow-xl hover:bg-red-600 transition-colors z-50"
                        >
                            <X size={20} />
                        </button>
                   </div>
              </div>
          </div>
      )}

      {/* Bulk Action Bar (Floating) */}
       {selectedIds.size > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-md border border-slate-600 rounded-2xl shadow-2xl p-2 px-4 flex items-center gap-4 z-50 animate-in slide-in-from-bottom-6">
                <span className="text-sm font-bold text-white mr-2">{selectedIds.size} Selected</span>
                
                <div className="h-6 w-px bg-slate-600"></div>

                <button 
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="flex flex-col items-center gap-1 text-slate-300 hover:text-red-400 p-2 rounded transition-colors group disabled:opacity-50"
                >
                    {isDeleting ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} className="group-hover:scale-110 transition-transform" />}
                    <span className="text-[10px] font-medium">{isDeleting ? 'Deleting' : 'Delete'}</span>
                </button>
            </div>
        )}
    </div>
  );
};

export default OutfitTryOn;
