
import { 
    Gender, Physique, Ethnicity, 
    ModelGenerationStep, ModelConfig, Resolution, 
    GenerationHistoryItem, ModelViewType, ModelAngle, ReferenceWeight,
    ReferenceImage
} from '../types';
import { generateFashionModelStep, analyzeBackgroundImage, analyzeFaceFeatures, generatePromptVariation, analyzeFaceDNA, analyzeComposition, analyzePoseStructure, hasAnyApiKey } from '../services/geminiService';
import { saveImageToLocal, softDeleteImage, deleteMultipleImages } from '../services/localDb';
import { DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT, DEFAULT_FEMALE_HEIGHT, DEFAULT_MALE_HEIGHT } from '../constants';
import { 
    Loader2, Camera, Upload, X, Download, 
    ArrowRight, User, 
    Move, Wand2, Shirt, Square,
    Image as ImageIcon,
    Sliders,
    Check,
    Trash2,
    ScanSearch,
    CloudUpload,
    CheckSquare,
    MousePointer2,
    Zap,
    Briefcase,
    Coffee,
    Glasses,
    Sparkles, 
    ScanLine,
    Dices,
    Expand,
    Box,
    ScanEye,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import ImageModal from './ImageModal';
import { ModelTransferPayload } from '../App';
import { CameraMannequinControl } from './CameraMannequinControl';
import { ReferenceUploader } from './ReferenceUploader';
import { resizeImageFile } from '../utils/imageUtils';
import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ModelGeneratorProps {
  onSelectAsBaseModel: (base64: string) => void;
  userId: string;
  transferPayload?: ModelTransferPayload | null;
  onTransferConsumed?: () => void;
  onOpenKeySelector?: () => void;
}

// Robust URL to Base64 converter
const urlToBase64 = async (url: string): Promise<string> => {
  if (url.startsWith('data:')) return url;
  try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
      });
  } catch (error) {
      console.error("Base64 conversion failed", error);
      throw error;
  }
};

const ModelGenerator: React.FC<ModelGeneratorProps> = ({ onSelectAsBaseModel, userId, transferPayload, onTransferConsumed, onOpenKeySelector }) => {
  // --- Global App State ---
  const [currentStep, setCurrentStep] = useState<ModelGenerationStep>(ModelGenerationStep.STEP1_IDENTITY);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState<ModelGenerationStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Progressive Rendering State - FIXED POSITION LOGIC
  const [currentSessionImages, setCurrentSessionImages] = useState<(GenerationHistoryItem | { id: string, type: 'placeholder' })[]>([]); 

  // --- Selection & Bulk Actions State ---
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // --- Step 1 Inputs (Identity) ---
  const [gender, setGender] = useState<Gender>(Gender.Female);
  const [ethnicity, setEthnicity] = useState<Ethnicity>(Ethnicity.White); // White를 기본값으로 변경
  const [physique, setPhysique] = useState<Physique>(Physique.Slim);
  const [height, setHeight] = useState<number>(DEFAULT_FEMALE_HEIGHT);
  const [viewType, setViewType] = useState<ModelViewType>('FULL_BODY');
  const [facePrompt, setFacePrompt] = useState('');
  const [faceRefImage, setFaceRefImage] = useState<string | null>(null);
  const [faceRefWeight, setFaceRefWeight] = useState<ReferenceWeight>('HIGH');
  const [hairPrompt, setHairPrompt] = useState('');
  const [bodyPrompt, setBodyPrompt] = useState(''); 
  const [isAnalyzingFace, setIsAnalyzingFace] = useState(false);
  const [isVaryingFace, setIsVaryingFace] = useState(false);
  const [isVaryingHair, setIsVaryingHair] = useState(false);

  // Dropdown States for Step 1 Details
  const [showFaceDetail, setShowFaceDetail] = useState(false);
  const [showHairDetail, setShowHairDetail] = useState(false);
  const [showBodyDetail, setShowBodyDetail] = useState(false);
  
  // New Age Logic
  const [numericAge, setNumericAge] = useState<number>(24);
  const [agePrompt, setAgePrompt] = useState('24 years old');

  // Auto Generation Trigger
  const [autoGenTrigger, setAutoGenTrigger] = useState(false);

  // Sync numeric age to prompt string
  useEffect(() => {
      setAgePrompt(`${numericAge} years old`);
  }, [numericAge]);

  // 성별 변경 시 기본 키 자동 설정
  useEffect(() => {
      if (gender === Gender.Male) {
          setHeight(DEFAULT_MALE_HEIGHT);
      } else {
          setHeight(DEFAULT_FEMALE_HEIGHT);
      }
  }, [gender]);
  
  // --- Step 2 Inputs (Multi-View) ---
  const [step1SelectedImage, setStep1SelectedImage] = useState<string | null>(null); 
  const [isStep1SourceExternal, setIsStep1SourceExternal] = useState<boolean>(false);
  const [selectedAngles, setSelectedAngles] = useState<ModelAngle[]>(['FRONT', 'SIDE', 'BACK']);
  const [step2Prompt, setStep2Prompt] = useState('');
  const [step2ActionPrompt, setStep2ActionPrompt] = useState('');
  
  // Step 2 New States
  const [step2Mode, setStep2Mode] = useState<'CUBE' | 'REF'>('CUBE');
  const [step2RefImage, setStep2RefImage] = useState<ReferenceImage | null>(null);
  const [isAnalyzingComposition, setIsAnalyzingComposition] = useState(false);
  const [isStep2MenuOpen, setIsStep2MenuOpen] = useState(true);
  const [dontLookAtCamera, setDontLookAtCamera] = useState<boolean>(false);

  // --- Step 3 Inputs (Pose) ---
  const [step2SelectedImage, setStep2SelectedImage] = useState<string | null>(null); 
  const [isStep2SourceExternal, setIsStep2SourceExternal] = useState<boolean>(false); 
  const [step2SourceHasStats, setStep2SourceHasStats] = useState<boolean>(true); 
  const [poseRefImage, setPoseRefImage] = useState<string | null>(null); 
  const [posePrompt, setPosePrompt] = useState(''); 
  const [isAnalyzingPose, setIsAnalyzingPose] = useState(false);
  const [useFaceConsistency, setUseFaceConsistency] = useState(true);
  const [faceConsistencyImages, setFaceConsistencyImages] = useState<string[]>([]);
  
  // Step 3 Background
  const [changeBackground, setChangeBackground] = useState<boolean>(false);
  const [backgroundPrompt, setBackgroundPrompt] = useState('');
  const [backgroundReferenceImage, setBackgroundReferenceImage] = useState<string | null>(null);
  const [isAnalyzingBackground, setIsAnalyzingBackground] = useState(false);

  const poseInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const faceConsistencyInputRef = useRef<HTMLInputElement>(null);
  const step2SourceInputRef = useRef<HTMLInputElement>(null);
  const step3SourceInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  // --- Common Settings ---
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [quantity, setQuantity] = useState(1);

  // --- Outputs (History) ---
  const [step1History, setStep1History] = useState<GenerationHistoryItem[]>([]);
  const [step2History, setStep2History] = useState<GenerationHistoryItem[]>([]);
  const [step3History, setStep3History] = useState<GenerationHistoryItem[]>([]);
  
  // --- Modal ---
  const [selectedModalItem, setSelectedModalItem] = useState<GenerationHistoryItem | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Helper for step-specific history
  const getHistoryForStep = useCallback((step: ModelGenerationStep) => {
    switch(step) {
      case ModelGenerationStep.STEP1_IDENTITY: return step1History;
      case ModelGenerationStep.STEP2_MULTIVIEW: return step2History;
      case ModelGenerationStep.STEP3_POSE: return step3History;
      default: return [];
    }
  }, [step1History, step2History, step3History]);

  // Helper: Base64 to Blob URL
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

  // --- Handlers with Resizing ---
  const handleFaceRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await resizeImageFile(file, 1024, 0.85);
        setFaceRefImage(`data:image/jpeg;base64,${base64}`);
      } catch (err) {
        setError("이미지 처리 중 오류 발생");
      }
    }
  };

  const handlePoseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await resizeImageFile(file, 1024, 0.85);
        setPoseRefImage(`data:image/jpeg;base64,${base64}`);
      } catch (err) {
        setError("이미지 처리 중 오류 발생");
      } finally {
        if (poseInputRef.current) poseInputRef.current.value = '';
      }
    }
  };

  const handleFaceConsistencyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newImages: string[] = [];
    for (let i = 0; i < files.length; i++) {
        if (faceConsistencyImages.length + newImages.length >= 3) break;
        const file = files[i];
        if (file.size > 10 * 1024 * 1024) {
            setError("Each face reference image must be less than 10MB.");
            continue;
        }
        try {
            const base64 = await resizeImageFile(file, 1024, 0.85);
            newImages.push(`data:image/jpeg;base64,${base64}`);
        } catch (err) {
            console.error(err);
        }
    }
    
    if (newImages.length > 0) {
        setFaceConsistencyImages(prev => [...prev, ...newImages].slice(0, 3));
    }
    if (faceConsistencyInputRef.current) faceConsistencyInputRef.current.value = '';
  };

  const removeFaceConsistencyImage = (index: number) => {
    setFaceConsistencyImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyzePose = async () => {
      if (!poseRefImage) return;
      setIsAnalyzingPose(true);
      setError(null);
      try {
          const result = await analyzePoseStructure(poseRefImage);
          setPosePrompt(result);
          setPoseRefImage(null); // 분석 완료 후 이미지 삭제
          if (poseInputRef.current) poseInputRef.current.value = ''; // input value 초기화
      } catch (err: any) {
          setError("동작 분석 실패: " + err.message);
      } finally {
          setIsAnalyzingPose(false);
      }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await resizeImageFile(file, 4096, 0.95);
        setBackgroundReferenceImage(`data:image/jpeg;base64,${base64}`);
      } catch (err) {
        setError("이미지 처리 중 오류 발생");
      } finally {
        if (backgroundInputRef.current) backgroundInputRef.current.value = '';
      }
    }
  };

  const handleStep2SourceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await resizeImageFile(file, 4096, 0.95);
        setStep1SelectedImage(`data:image/jpeg;base64,${base64}`);
        setIsStep1SourceExternal(true);
      } catch (err) {
        setError("이미지 처리 중 오류 발생");
      }
    }
  };

  const handleStep3SourceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await resizeImageFile(file, 4096, 0.95);
        setStep2SelectedImage(`data:image/jpeg;base64,${base64}`);
        setIsStep2SourceExternal(true);
      } catch (err) {
        setError("이미지 처리 중 오류 발생");
      }
    }
  };

  // API Action handlers
  const handleImageAction = async (
      item: GenerationHistoryItem, 
      action: 'USE_AS_BASE' | 'TO_FULL_BODY' | 'GO_TO_STEP2' | 'GO_TO_STEP3'
  ) => {
      let data = item.base64Data;
      if (data.startsWith('http') || data.startsWith('blob:')) {
          try {
              data = await urlToBase64(data);
          } catch (e) {
              console.error("Failed to convert image", e);
              setError("이미지 변환 중 오류가 발생했습니다.");
              return;
          }
      }

      switch(action) {
          case 'USE_AS_BASE':
              onSelectAsBaseModel(data);
              break;
          case 'TO_FULL_BODY':
              setFaceRefImage(data);
              setFaceRefWeight('HIGH');
              setViewType('FULL_BODY');
              setAutoGenTrigger(true);
              if (selectedModalItem) setSelectedModalItem(null); 
              break;
          case 'GO_TO_STEP2':
              setStep1SelectedImage(data);
              setIsStep1SourceExternal(false);
              setCurrentStep(ModelGenerationStep.STEP2_MULTIVIEW);
              if (selectedModalItem) setSelectedModalItem(null);
              break;
          case 'GO_TO_STEP3':
              setStep2SelectedImage(data);
              setIsStep2SourceExternal(false);
              setStep2SourceHasStats(!!item.coreStats);
              setCurrentStep(ModelGenerationStep.STEP3_POSE);
              if (selectedModalItem) setSelectedModalItem(null);
              break;
      }
  };

  const handleAnalyzeFaceFeatures = async () => {
    if (!faceRefImage) return;
    setIsAnalyzingFace(true);
    setError(null);
    try {
      const base64 = faceRefImage.includes(',') ? faceRefImage.split(',')[1] : faceRefImage;
      const [features, dna] = await Promise.all([
          analyzeFaceFeatures(faceRefImage),
          analyzeFaceDNA(base64)
      ]);
      setFacePrompt(features.face);
      setHairPrompt(features.hair);
      if (dna.gender) setGender(dna.gender as Gender);
      if (dna.ethnicity) setEthnicity(dna.ethnicity as Ethnicity);
      if (dna.physique) setPhysique(dna.physique as Physique);
      if (dna.age) {
          setNumericAge(dna.age);
          setAgePrompt(`${dna.age} years old`);
      }
      
      // 분석 결과에 따라 키 재설정
      if (dna.gender === 'Male') setHeight(DEFAULT_MALE_HEIGHT); 
      else if (dna.gender === 'Female') setHeight(DEFAULT_FEMALE_HEIGHT);
      
      setShowFaceDetail(true);
      setShowHairDetail(true);
      setFaceRefImage(null);
      if (faceInputRef.current) faceInputRef.current.value = '';
    } catch (err: any) {
      console.error(err);
      setError("분석 실패: " + err.message);
    } finally {
      setIsAnalyzingFace(false);
    }
  };

  const handleRandomFaceVariation = async () => {
    if (!facePrompt) return;
    const currentPrompt = facePrompt;
    setFacePrompt("");
    setIsVaryingFace(true);
    try {
      const newPrompt = await generatePromptVariation(currentPrompt, 'face');
      setFacePrompt(newPrompt.trim());
      setShowFaceDetail(true);
    } catch (e) {
      console.error(e);
      setFacePrompt(currentPrompt);
    } finally {
      setIsVaryingFace(false);
    }
  };

  const handleRandomHairVariation = async () => {
    if (!hairPrompt) return;
    const currentPrompt = hairPrompt;
    setHairPrompt("");
    setIsVaryingHair(true);
    try {
      const newPrompt = await generatePromptVariation(currentPrompt, 'hair');
      setHairPrompt(newPrompt.trim());
      setShowHairDetail(true);
    } catch (e) {
      console.error(e);
      setHairPrompt(currentPrompt);
    } finally {
      setIsVaryingHair(false);
    }
  };

  const handleAnalyzeBackground = async () => {
    if (!backgroundReferenceImage) return;
    setIsAnalyzingBackground(true);
    setError(null);
    try {
        const result = await analyzeBackgroundImage(backgroundReferenceImage);
        setBackgroundPrompt(result);
        setBackgroundReferenceImage(null);
        if (backgroundInputRef.current) backgroundInputRef.current.value = '';
    } catch (err: any) {
        setError("Failed to analyze background image.");
    } finally {
        setIsAnalyzingBackground(false);
    }
  };

  const handleAnalyzeComposition = async () => {
      if (!step2RefImage) return;
      setIsAnalyzingComposition(true);
      setError(null);
      try {
          const result = await analyzeComposition(step2RefImage.base64);
          setStep2Prompt(result.trim());
          setSelectedAngles(['CUSTOM']);
          setStep2RefImage(null);
      } catch (err: any) {
          setError(err.message || "구도 분석 실패");
      } finally {
          setIsAnalyzingComposition(false);
      }
  };

  const handleResolutionChange = (newRes: Resolution) => {
    setResolution(newRes);
    const maxAllowed = 4;
    if (quantity > maxAllowed) setQuantity(maxAllowed);
  };

  const handleCameraChange = useCallback((promptText: string) => {
    setStep2Prompt(promptText);
    setSelectedAngles(['CUSTOM']);
  }, []);

  const handleCancel = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setGeneratingStep(null);
  };

  const handleFaceWeightChange = (value: string) => {
      if (value === '1') setFaceRefWeight('LOW');
      else if (value === '2') setFaceRefWeight('MID');
      else setFaceRefWeight('HIGH');
  };

  const getWeightLabel = () => {
      switch(faceRefWeight) {
          case 'LOW': return 'Low: Style & Vibe (New Face)';
          case 'MID': return 'Mid: Similar (Sibling Look)';
          case 'HIGH': return 'High: Exact (Fixed ID)';
      }
  };
  
  const getWeightDescription = () => {
       switch(faceRefWeight) {
          case 'LOW': return '분위기 참조 (Style): 색감과 조명 등 전체적인 분위기만 참고합니다. 얼굴과 세부 요소는 레퍼런스에 구애받지 않고 자유롭게 창조합니다.';
          case 'MID': return '특징 유지 (Similar): 형제자매처럼 닮은 느낌. 이목구비는 비슷하지만 미세하게 다른 인물.';
          case 'HIGH': return '인물 고정 (Exact): 얼굴(ID)을 강력하게 고정. 눈, 코, 입을 원본 그대로 유지합니다.';
      }
  };

  const toggleSelection = (id: string) => {
      setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  const handleSelectAll = () => {
      const ids = displayItems.filter(i => i.id !== 'placeholder' && 'base64Data' in i).map(i => i.id);
      setSelectedIds(new Set(ids));
  };

  const handleDeselectAll = () => {
      setSelectedIds(new Set());
  };

  const handleDeleteItem = async (id: string) => {
      const item = (currentSessionImages.find(i => i.id === id) as GenerationHistoryItem) || 
                   step1History.find(i => i.id === id) || 
                   step2History.find(i => i.id === id) || 
                   step3History.find(i => i.id === id);

      if (!window.confirm("이 이미지를 휴지통으로 이동하시겠습니까?")) return;

      const removeFromList = (list: GenerationHistoryItem[]) => list.filter(i => i.id !== id);
      
      setCurrentSessionImages(prev => prev.filter(i => i.id !== id));
      setStep1History(prev => removeFromList(prev));
      setStep2History(prev => removeFromList(prev));
      setStep3History(prev => removeFromList(prev));
      
      if (selectedModalItem?.id === id) setSelectedModalItem(null);

      if (userId && item && item.id) { 
        try {
            await softDeleteImage(item.id);
        } catch (error) {
            console.error("Soft delete failed:", error);
        }
      }
  };

  const handleBulkDelete = async () => {
      if (selectedIds.size === 0) return;
      if (!window.confirm(`선택한 ${selectedIds.size}개의 이미지를 휴지통으로 이동하시겠습니까?`)) return;

      setIsDeleting(true);
      const allItems = [...currentSessionImages, ...step1History, ...step2History, ...step3History].filter(i => !('type' in i)) as GenerationHistoryItem[];
      const itemsToDelete = allItems.filter(item => selectedIds.has(item.id));
      const updateList = (list: GenerationHistoryItem[]) => list.filter(item => !selectedIds.has(item.id));
      
      setCurrentSessionImages(prev => prev.filter(item => !selectedIds.has(item.id)));
      setStep1History(prev => updateList(prev));
      setStep2History(prev => updateList(prev));
      setStep3History(prev => updateList(prev));

      const promises = itemsToDelete
          .filter(item => item.id)
          .map(item => softDeleteImage(item.id!));

      await Promise.all(promises);
      setIsDeleting(false);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
  };

  // Helper to update specific history items
  const updateHistoryItemState = (stableId: string, updates: Partial<GenerationHistoryItem>) => {
    const updater = (prev: GenerationHistoryItem[]) => 
        prev.map(item => item.id === stableId ? { ...item, ...updates } : item);
    
    // For session images, we need to handle the mix of types
    setCurrentSessionImages(prev => prev.map(item => {
        if (!('type' in item) && item.id === stableId) {
            return { ...item, ...updates };
        }
        return item;
    }));
    
    setStep1History(updater);
    setStep2History(updater);
    setStep3History(updater);
  };

  const handleGenerate = async () => {
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
            setError("API Key가 필요합니다. 설정에서 API Key를 입력해 주세요.");
            return;
        }
    }

    setError(null);
    setIsGenerating(true);
    setGeneratingStep(currentStep);

    const targetCount = (currentStep === ModelGenerationStep.STEP2_MULTIVIEW && selectedAngles.includes('CUSTOM')) ? quantity : (currentStep === ModelGenerationStep.STEP2_MULTIVIEW ? selectedAngles.length : quantity);
    
    // PRE-INITIALIZE SESSION WITH PLACEHOLDERS (Stable Position)
    const placeholders = Array.from({ length: targetCount }, (_, i) => ({ 
        id: `placeholder-${i}-${Date.now()}`, 
        type: 'placeholder' as const 
    }));
    setCurrentSessionImages(placeholders);

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const localStep = currentStep; 
    const sessionImages: GenerationHistoryItem[] = [];
    let finishedIndex = 0;

    try {
        let finalPosePrompt = posePrompt;
        let step3Instruction = "";
        let finalStep2Prompt = step2Prompt;

        if (localStep === ModelGenerationStep.STEP2_MULTIVIEW && step1SelectedImage) {
            // [GENDER & IDENTITY ENFORCEMENT PROTOCOL V3.9 - STEP 2]
            const step2IdentityLock = `
[CRITICAL: IDENTITY & POSE LOCK]
1. **SOURCE IMAGE**: This is the ONLY source for the person's IDENTITY (face, features, hair), POSE, and CLOTHING.
2. **FIDELITY**: The person's face, expression, body pose, and outfit must be 1:1 identical to the source image.
3. **CAMERA CHANGE ONLY**: ONLY the camera angle/viewpoint changes. The person's physical state remains frozen.
4. **EYE CONTACT**: ${dontLookAtCamera ? "The person MUST NOT look at the camera. Maintain their original gaze direction relative to their head." : "The person MUST look directly at the camera."}
`;
            finalStep2Prompt = `${step2IdentityLock}\n${step2Prompt} ${step2ActionPrompt ? `Action Instruction: ${step2ActionPrompt}` : ''}`;
        }

        if (localStep === ModelGenerationStep.STEP3_POSE && step2SelectedImage) {
            // [GENDER & IDENTITY ENFORCEMENT PROTOCOL V3.9]
            // 사용자의 요청에 따라 얼굴과 표정 보존을 최우선으로 설정
            const identityMasterLock = `
[CRITICAL: IDENTITY & CLOTHING LOCK]
1. **IMAGE 1 (SOURCE)**: This is the ONLY source for the person's IDENTITY (face, features, hair) and CLOTHING (design, color, texture).
2. **FACIAL FIDELITY**: The face and expression must be 1:1 identical to Image 1.
3. **CLOTHING FIDELITY**: The person must wear the EXACT SAME outfit from Image 1.
4. **IMAGE 2 (POSE)**: This is the ABSOLUTE SKELETAL REFERENCE. Replicate the exact limb positions, body angle, and pose from Image 2.
5. **SYSTEM RULE**: Map the skeletal structure of Image 2 onto the character from Image 1.
`;

            if (poseRefImage) {
                finalPosePrompt = `
${identityMasterLock}
[SKELETAL MAPPING INSTRUCTIONS]
- **TARGET**: Character from Image 1.
- **POSE SOURCE**: Image 2.
- **EXECUTION**: Replicate the exact skeletal pose, joint angles, and limb positions from Image 2.
- **POSE PRECISION**:
    - **BODY ROTATION**: Match the exact torso and hip rotation of Image 2.
    - **LIMB ANGLES**: Match the exact angles of elbows, knees, and wrists from Image 2.
    - **FOOT PLACEMENT**: Match the exact orientation of the feet from Image 2.
- **RESTRICTION**: Do NOT use the face, identity, or clothes of the person in Image 2. Use ONLY their skeletal pose.
- **USER DETAIL**: ${posePrompt || "Replicate the exact skeletal pose, limb positions, and body physics from Image 2 while maintaining the character's identity and clothing from Image 1."}
`;
            } else if (posePrompt) {
                 finalPosePrompt = `
${identityMasterLock}
[ACTION]: ${posePrompt}. 
Maintain the person's face and original expression from Image 1 while performing the action.
`;
            }

            const compositionSettings = `
[PRO COMPOSITION SETTINGS]
- LIGHTING HARMONIZATION: Match subject lighting to the environment.
- CONTACT SHADOWS: 95% density.
`;
            const adaptiveFraming = `
[FRAME LOCK]: Match the zoom and framing of Image 1. 
`;

            if (changeBackground) {
                step3Instruction = `
${compositionSettings}
[BACKGROUND SYNTHESIS]: Replace background with "${backgroundPrompt || 'provided background'}". 
Keep the person's identity and facial expression from Image 1 exactly.
`;
            } else {
                step3Instruction = `
${compositionSettings}
[ENHANCEMENT]: Enhance clarity while preserving identity.
`;
            }
            finalPosePrompt = `${finalPosePrompt || ''}\n${adaptiveFraming}`;
        }

        const config: ModelConfig = {
            step: localStep,
            gender, ethnicity, physique, height, viewType, facePrompt,
            faceReferenceImage: faceRefImage || undefined,
            faceReferenceWeight: faceRefImage ? faceRefWeight : undefined,
            hairPrompt,
            bodyPrompt: localStep === ModelGenerationStep.STEP1_IDENTITY ? bodyPrompt : undefined, 
            agePrompt,
            sourceImage: localStep === ModelGenerationStep.STEP2_MULTIVIEW ? step1SelectedImage! : 
                         localStep === ModelGenerationStep.STEP3_POSE ? step2SelectedImage! : undefined,
            targetAngles: selectedAngles,
            step2Prompt: localStep === ModelGenerationStep.STEP3_POSE 
                ? step3Instruction 
                : (localStep === ModelGenerationStep.STEP2_MULTIVIEW ? finalStep2Prompt : undefined),
            poseReferenceImage: poseRefImage || undefined,
            posePrompt: finalPosePrompt,
            faceConsistencyImages: (localStep === ModelGenerationStep.STEP3_POSE && useFaceConsistency && faceConsistencyImages.length > 0) ? faceConsistencyImages : undefined,
            changeBackground: changeBackground,
            backgroundPrompt: changeBackground ? backgroundPrompt : undefined,
            backgroundReferenceImage: (changeBackground && backgroundReferenceImage) ? backgroundReferenceImage : undefined,
            lightingMatch: localStep === ModelGenerationStep.STEP3_POSE ? 95 : undefined,
            shadowIntensity: localStep === ModelGenerationStep.STEP3_POSE ? 85 : undefined,
            quantity: targetCount, 
            resolution: resolution
        };

        if (localStep === ModelGenerationStep.STEP2_MULTIVIEW && !step1SelectedImage) throw new Error("Base model missing.");
        if (localStep === ModelGenerationStep.STEP3_POSE && !step2SelectedImage) throw new Error("Character source missing.");

        const usedReferences: string[] = [];
        if (config.faceReferenceImage) usedReferences.push(config.faceReferenceImage);
        if (config.sourceImage) usedReferences.push(config.sourceImage);
        if (config.poseReferenceImage) usedReferences.push(config.poseReferenceImage);
        if (config.backgroundReferenceImage) usedReferences.push(config.backgroundReferenceImage);

        await generateFashionModelStep(
            config, 
            abortControllerRef.current.signal,
            async (base64, angle) => {
                let includeStats = true;
                if (localStep === ModelGenerationStep.STEP2_MULTIVIEW && isStep1SourceExternal) includeStats = false;
                if (localStep === ModelGenerationStep.STEP3_POSE) {
                    if (isStep2SourceExternal) includeStats = false;
                    else includeStats = step2SourceHasStats;
                }

                let promptDesc = `${gender}, ${ethnicity}`;
                if (localStep === ModelGenerationStep.STEP2_MULTIVIEW) {
                     if (step2Prompt) promptDesc += ` | ${step2Prompt}`;
                } else if (localStep === ModelGenerationStep.STEP3_POSE) {
                     if (posePrompt) promptDesc += ` | ${posePrompt}`;
                }
                
                if (!base64) return;
                const blobUrl = base64ToBlobUrl(base64);
                const stableId = crypto.randomUUID();
                const newItem: GenerationHistoryItem = {
                    id: stableId,
                    base64Data: blobUrl || base64,
                    userPrompt: promptDesc,
                    timestamp: Date.now(),
                    gender,
                    step: localStep,
                    resolution: resolution,
                    referenceImages: usedReferences,
                    angle: angle, 
                    coreStats: includeStats ? { gender, ethnicity, physique, height } : undefined,
                    viewType,
                    faceDetail: facePrompt,
                    hairDetail: hairPrompt,
                    bodyDetail: localStep === ModelGenerationStep.STEP1_IDENTITY ? bodyPrompt : undefined, 
                    poseDetail: localStep === ModelGenerationStep.STEP3_POSE ? posePrompt : undefined,
                    age: agePrompt,
                    faceReferenceWeight: config.faceReferenceWeight,
                    isUploading: true,
                    tempUrl: blobUrl || undefined
                };
                
                sessionImages.push(newItem);
                
                // Replace placeholder at current finishedIndex
                const currentIndex = finishedIndex;
                setCurrentSessionImages(prev => {
                    const next = [...prev];
                    next[currentIndex] = newItem;
                    return next;
                });
                finishedIndex++;
                
                if (userId) {
                    saveImageToLocal(userId, {
                        ...newItem, 
                        url: newItem.base64Data,
                        category: "MODEL_GEN" as any, 
                        prompt: newItem.userPrompt 
                    }, base64).then((result) => {
                        if (result) {
                            updateHistoryItemState(stableId, {
                                isUploading: false,
                                id: result.id,
                                storagePath: result.storagePath 
                            });
                        }
                    }).catch(e => {
                        console.error("Auto-save failed", e);
                        updateHistoryItemState(stableId, { isUploading: false }); 
                    });
                } else {
                    updateHistoryItemState(stableId, { isUploading: false });
                }
            }
        );

        // Persistent update BEFORE clearing session to prevent flash of empty history
        if (sessionImages.length > 0) {
            if (localStep === ModelGenerationStep.STEP1_IDENTITY) setStep1History(prev => [...sessionImages, ...prev]);
            else if (localStep === ModelGenerationStep.STEP2_MULTIVIEW) setStep2History(prev => [...sessionImages, ...prev]);
            else if (localStep === ModelGenerationStep.STEP3_POSE) setStep3History(prev => [...sessionImages, ...prev]);
        }

    } catch (err: any) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg !== "Operation cancelled by user") setError(errorMsg);
    } finally {
        setIsGenerating(false);
        setGeneratingStep(null);
        setCurrentSessionImages([]); 
        abortControllerRef.current = null;
    }
  };

  const handleDownload = (base64: string, prefix: string) => {
    const link = document.createElement('a');
    link.href = base64;
    link.download = `${prefix}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCurrentHistoryList = () => {
      // In-session images come first (placeholders or real)
      const session = currentSessionImages.filter(i => !('type' in i)) as GenerationHistoryItem[];
      return session.concat(getHistoryForStep(currentStep));
  };

  const handleModalPrev = () => {
      if (!selectedModalItem) return;
      const list = getCurrentHistoryList();
      if (list.length <= 1) return;
      const idx = list.findIndex(i => i.id === selectedModalItem.id);
      if (idx <= 0) setSelectedModalItem(list[list.length - 1]);
      else setSelectedModalItem(list[idx - 1]);
  };

  const handleModalNext = () => {
      if (!selectedModalItem) return;
      const list = getCurrentHistoryList();
      if (list.length <= 1) return;
      const idx = list.findIndex(i => i.id === selectedModalItem.id);
      if (idx >= list.length - 1) setSelectedModalItem(list[0]);
      else setSelectedModalItem(list[idx + 1]);
  };

  const hasNavigation = selectedModalItem ? getCurrentHistoryList().length > 1 : false;

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-8 px-4 md:px-20">
       {[
         { id: ModelGenerationStep.STEP1_IDENTITY, label: '1. Model Identity', icon: User },
         { id: ModelGenerationStep.STEP2_MULTIVIEW, label: '2. Multi-View Studio', icon: Camera },
         { id: ModelGenerationStep.STEP3_POSE, label: '3. Pose & Physics', icon: Move },
       ].map((step) => {
          const isActive = currentStep === step.id;
          return (
            <div key={step.id} className={`flex flex-col items-center gap-2 cursor-pointer relative z-10 group`} onClick={() => { setCurrentStep(step.id); setIsSelectionMode(false); setSelectedIds(new Set()); }}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isActive ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-slate-800 border-slate-600 text-slate-500 group-hover:border-slate-400 group-hover:text-slate-300'}`}>
                    <step.icon size={20} />
                </div>
                <span className={`text-xs font-bold uppercase tracking-wider ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>{step.label}</span>
            </div>
          );
       })}
       <div className="absolute top-4 md:top-[4.5rem] left-0 w-full h-0.5 bg-slate-800 -z-0 hidden md:block" />
    </div>
  );

  const pastHistory = getHistoryForStep(currentStep);
  const displayItems = [...currentSessionImages, ...pastHistory];

  return (
    <div className="flex h-full w-full bg-[#0f172a] text-slate-200 overflow-hidden">
        <div className="w-80 md:w-[340px] bg-[#1e293b] border-r border-slate-700 flex flex-col h-full z-20 shadow-xl overflow-y-auto custom-scrollbar">
            <div className="p-6">
                <h2 className="text-xl font-bold text-[#818cf8] mb-6">
                    {currentStep === ModelGenerationStep.STEP1_IDENTITY ? '1. Model Identity' : 
                     currentStep === ModelGenerationStep.STEP2_MULTIVIEW ? '2. Multi-View Studio' : 
                     '3. Pose & Physics'}
                </h2>
                {currentStep === ModelGenerationStep.STEP1_IDENTITY && (
                    <div className="space-y-6">
                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/50 space-y-4">
                             <h3 className="text-xs font-bold text-blue-400 uppercase mb-2">CORE STATS</h3>
                             <div className="grid grid-cols-2 gap-3">
                                 <div>
                                     <label className="text-xs text-slate-500 block mb-1">Gender</label>
                                     <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm">{Object.values(Gender).map(g => <option key={g} value={g}>{g}</option>)}</select>
                                 </div>
                                 <div>
                                     <label className="text-xs text-slate-500 block mb-1">Ethnicity</label>
                                     <select value={ethnicity} onChange={(e) => setEthnicity(e.target.value as Ethnicity)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm">{Object.values(Ethnicity).map(e => <option key={e} value={e}>{e}</option>)}</select>
                                 </div>
                                 <div>
                                     <label className="text-xs text-slate-500 block mb-1">Physique</label>
                                     <select value={physique} onChange={(e) => setPhysique(e.target.value as Physique)} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm">{Object.values(Physique).map(p => <option key={p} value={p}>{p}</option>)}</select>
                                 </div>
                                 <div>
                                     <label className="text-xs text-slate-500 block mb-1">Height (cm)</label>
                                     <input type="number" min={MIN_HEIGHT} max={MAX_HEIGHT} value={height} onChange={(e) => setHeight(Number(e.target.value))} className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm" />
                                 </div>
                             </div>
                        </div>
                        <div className="space-y-4">
                             <div className="flex gap-2 p-1 bg-slate-900 rounded-lg mb-4">{[{ id: 'FULL_BODY', label: 'Full Body' }, { id: 'UPPER_BODY', label: 'Upper Body' }, { id: 'FACE_ZOOM', label: 'Face Zoom' }].map((v) => (<button key={v.id} onClick={() => setViewType(v.id as ModelViewType)} className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-md transition-all ${viewType === v.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>{v.label}</button>))}</div>
                             <div className="space-y-3">
                                 <label className="text-xs font-semibold text-slate-400 mb-2 block">Identity Details <span className="text-amber-500 text-[9px]">(Optional)</span></label>
                                 
                                 <div onClick={() => faceInputRef.current?.click()} className="border border-dashed border-slate-600 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-800 hover:border-blue-500 transition-all bg-slate-900/50 mb-3">
                                    {faceRefImage ? (
                                        <div className="flex items-center gap-2 w-full animate-in fade-in">
                                            <img src={faceRefImage} className="w-10 h-10 rounded object-cover border border-slate-600" alt="Face Ref" />
                                            <div className="flex-1 min-w-0">
                                                <span className="text-xs text-green-400 block truncate font-bold">Face Reference Loaded</span>
                                                <span className="text-[9px] text-slate-500 block">Choose specific action below</span>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); setFaceRefImage(null); }} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <Camera size={16} className="text-slate-500" />
                                            <span className="text-xs text-slate-500">Upload Face Reference (Optional)</span>
                                        </>
                                    )}
                                 </div>
                                 {faceRefImage && (
                                     <div className="grid grid-cols-2 gap-2 mt-1 mb-3 animate-in slide-in-from-top-1">
                                         <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-2 flex flex-col items-center justify-center">
                                             <span className="text-[9px] text-slate-500 mb-0.5">Current Mode</span>
                                             <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1"><User size={10} /> Use Reference</span>
                                         </div>
                                         <button 
                                             onClick={handleAnalyzeFaceFeatures} 
                                             disabled={isAnalyzingFace} 
                                             className="bg-gradient-to-br from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white rounded p-2 flex flex-col items-center justify-center transition-all shadow-lg shadow-purple-900/20 border border-purple-400/30 group relative overflow-hidden"
                                         >
                                             {isAnalyzingFace ? (
                                                 <div className="flex items-center gap-1">
                                                     <Loader2 size={12} className="animate-spin" />
                                                     <span className="text-[10px] font-bold">분석 중...</span>
                                                 </div>
                                             ) : (
                                                 <>
                                                     <span className="text-[9px] text-purple-100 mb-0.5 group-hover:text-white">New Feature</span>
                                                     <span className="text-[10px] font-bold flex items-center gap-1"><ScanLine size={12} className="text-pink-200" /> 특징 추출 (Extract)</span>
                                                 </>
                                             )}
                                         </button>
                                     </div>
                                 )}
                                 <input type="file" ref={faceInputRef} onChange={handleFaceRefUpload} className="hidden" accept="image/*" />
                                 {faceRefImage && (<div className="mb-3 bg-slate-900/50 p-3 rounded-xl border border-slate-700 animate-in fade-in slide-in-from-top-2"><div className="flex items-center justify-between mb-2"><label className="text-[10px] font-bold text-blue-400 flex items-center gap-1"><Sliders size={12} /> Reference Weight</label><span className="text-[10px] text-white font-medium bg-blue-900/50 px-2 py-0.5 rounded">{getWeightLabel()}</span></div><input type="range" min="1" max="3" step="1" value={faceRefWeight === 'LOW' ? 1 : faceRefWeight === 'MID' ? 2 : 3} onChange={(e) => handleFaceWeightChange(e.target.value)} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 mb-2" /><div className="flex justify-between px-1 mb-2"><span className={`text-[9px] ${faceRefWeight === 'LOW' ? 'text-white font-bold' : 'text-slate-500'}`}>Style</span><span className={`text-[9px] ${faceRefWeight === 'MID' ? 'text-white font-bold' : 'text-slate-500'}`}>Similar</span><span className={`text-[9px] ${faceRefWeight === 'HIGH' ? 'text-white font-bold' : 'text-slate-500'}`}>Exact</span></div><p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-700 pt-2 mt-1">{getWeightDescription()}</p></div>)}

                                <div className="space-y-2">
                                    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/30">
                                        <button 
                                            onClick={() => setShowFaceDetail(!showFaceDetail)}
                                            className="w-full flex items-center justify-between p-3 hover:bg-slate-800 transition-colors"
                                        >
                                            <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                                                <User size={14} className="text-blue-400" /> Face Details
                                            </span>
                                            {showFaceDetail ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                        {showFaceDetail && (
                                            <div className="p-3 pt-0 animate-in slide-in-from-top-1 duration-200">
                                                <div className="flex justify-end mb-2">
                                                    <button onClick={handleRandomFaceVariation} disabled={isVaryingFace || !facePrompt} className="flex items-center gap-1 text-[9px] bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white px-2 py-1 rounded transition-colors border border-slate-600 hover:border-blue-500 disabled:opacity-50">
                                                        {isVaryingFace ? <Loader2 size={10} className="animate-spin" /> : <Dices size={10} />}
                                                        {isVaryingFace ? "Changing..." : "AI Variation"}
                                                    </button>
                                                </div>
                                                <textarea 
                                                    placeholder={isAnalyzingFace ? "얼굴 특징을 분석하고 있습니다..." : "예: 날카로운 턱선, 푸른 눈"} 
                                                    value={facePrompt} 
                                                    onChange={(e) => setFacePrompt(e.target.value)} 
                                                    className={`w-full bg-slate-800 border rounded p-2 text-sm outline-none resize-none h-20 custom-scrollbar transition-colors ${isAnalyzingFace ? 'border-purple-500 text-purple-200 animate-pulse' : 'border-slate-600 focus:border-blue-500'}`} 
                                                    disabled={isAnalyzingFace || isVaryingFace} 
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/30">
                                        <button 
                                            onClick={() => setShowHairDetail(!showHairDetail)}
                                            className="w-full flex items-center justify-between p-3 hover:bg-slate-800 transition-colors"
                                        >
                                            <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                                                <Sparkles size={14} className="text-pink-400" /> Hair Style
                                            </span>
                                            {showHairDetail ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                        {showHairDetail && (
                                            <div className="p-3 pt-0 animate-in slide-in-from-top-1 duration-200">
                                                <div className="flex justify-end mb-2">
                                                    <button onClick={handleRandomHairVariation} disabled={isVaryingHair || !hairPrompt} className="flex items-center gap-1 text-[9px] bg-slate-800 hover:bg-pink-600 text-slate-400 hover:text-white px-2 py-1 rounded transition-colors border border-slate-600 hover:border-pink-500 disabled:opacity-50">
                                                        {isVaryingHair ? <Loader2 size={10} className="animate-spin" /> : <Dices size={10} />}
                                                        {isVaryingHair ? "Changing..." : "AI Variation"}
                                                    </button>
                                                </div>
                                                <input 
                                                    type="text" 
                                                    placeholder="예: 긴 갈색 웨이브 머리" 
                                                    value={hairPrompt} 
                                                    onChange={(e) => setHairPrompt(e.target.value)} 
                                                    className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm focus:border-blue-500 outline-none" 
                                                    disabled={isVaryingHair} 
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/30">
                                        <button 
                                            onClick={() => setShowBodyDetail(!showBodyDetail)}
                                            className="w-full flex items-center justify-between p-3 hover:bg-slate-800 transition-colors"
                                        >
                                            <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                                                <Expand size={14} className="text-emerald-400" /> Body Details
                                            </span>
                                            {showBodyDetail ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                        {showBodyDetail && (
                                            <div className="p-3 pt-0 animate-in slide-in-from-top-1 duration-200">
                                                <input 
                                                    type="text" 
                                                    placeholder="e.g. Broad shoulders, long legs, 8-head ratio..." 
                                                    value={bodyPrompt} 
                                                    onChange={(e) => setBodyPrompt(e.target.value)} 
                                                    className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm focus:border-blue-500 outline-none mt-2" 
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                             </div>
                             <div>
                                <label className="text-xs font-semibold text-slate-400 mb-2 block">Age Demographic</label>
                                <div className="grid grid-cols-3 gap-2 mb-3">{[{ label: 'Gen Z', range: '18-24', val: 21, icon: Zap }, { label: 'Young', range: '25-34', val: 29, icon: User }, { label: 'Adult', range: '35-49', val: 42, icon: Briefcase }, { label: 'Middle', range: '50-64', val: 57, icon: Coffee }, { label: 'Senior', range: '65+', val: 70, icon: Glasses }].map((group) => {
                                        let active = (group.label === 'Gen Z' && numericAge <= 24) || (group.label === 'Young' && numericAge >= 25 && numericAge <= 34) || (group.label === 'Adult' && numericAge >= 35 && numericAge <= 49) || (group.label === 'Middle' && numericAge >= 50 && numericAge <= 64) || (group.label === 'Senior' && numericAge >= 65);
                                        return (<button key={group.label} onClick={() => setNumericAge(group.val)} className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${active ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-slate-800 border-slate-600 text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}><group.icon size={16} className="mb-1" /><span className="text-[10px] font-bold">{group.label}</span><span className="text-[9px] opacity-70">{group.range}</span></button>);
                                    })}</div>
                                <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-700"><div className="flex justify-between items-center mb-1"><span className="text-[10px] text-slate-500 font-medium">Fine-tune Age</span><span className="text-xs font-bold text-blue-400">{numericAge} years old</span></div><input type="range" min="18" max="90" value={numericAge} onChange={(e) => setNumericAge(Number(e.target.value))} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" /><div className="flex justify-between text-[9px] text-slate-600 mt-1"><span>18</span><span>90+</span></div></div>
                             </div>
                        </div>
                    </div>
                )}
                {currentStep === ModelGenerationStep.STEP2_MULTIVIEW && (
                    <div className="space-y-6">
                        <div className={`bg-slate-900 p-4 rounded-xl border transition-colors ${step1SelectedImage ? 'border-blue-500/30' : 'border-slate-800'}`}>
                            <h3 className="text-xs font-bold text-blue-400 uppercase mb-2 flex justify-between items-center">
                                Selected Source 
                                <span className="text-amber-500 text-[9px] normal-case font-normal">(Max 10MB)</span>
                                <div className="flex items-center gap-2">
                                    {step1SelectedImage && (
                                        <button onClick={() => setStep1SelectedImage(null)} className="text-[10px] text-red-400 hover:text-red-300 underline flex items-center gap-1">
                                            <Trash2 size={10} /> Remove
                                        </button>
                                    )}
                                    <button onClick={() => step2SourceInputRef.current?.click()} className="text-[10px] text-slate-400 hover:text-white underline flex items-center gap-1">
                                        <Upload size={10} /> Upload
                                    </button>
                                </div>
                            </h3>
                            <div onClick={() => step2SourceInputRef.current?.click()} className={`cursor-pointer group relative rounded-lg overflow-hidden border transition-colors ${step1SelectedImage ? 'border-slate-700/50 hover:border-blue-500' : 'border-slate-800 hover:border-slate-700'}`}>
                                {step1SelectedImage ? (
                                    <>
                                        <img src={step1SelectedImage} className="w-full aspect-[3/4] object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Source" />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-xs font-medium text-white flex items-center gap-1"><Upload size={12} /> Change Image</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-xs gap-2 bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                                        <User size={24} className="opacity-50" />
                                        <span>Click to Upload Source</span>
                                    </div>
                                )}
                            </div>
                            <input type="file" ref={step2SourceInputRef} onChange={handleStep2SourceUpload} className="hidden" accept="image/*" />
                        </div>
                        <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-900/30">
                            <button onClick={() => setIsStep2MenuOpen(!isStep2MenuOpen)} className="w-full flex items-center justify-between p-3 bg-slate-800 hover:bg-slate-700 transition-colors">
                                <span className="text-sm font-bold text-slate-200 flex items-center gap-2"><Camera size={16} className="text-blue-400"/> Camera Settings</span>
                                {isStep2MenuOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                            </button>
                            {isStep2MenuOpen && (
                                <div className="p-3 animate-in slide-in-from-top-2 duration-200">
                                    <div className="flex gap-2 mb-4 bg-slate-900 p-1 rounded-lg">
                                        <button onClick={() => setStep2Mode('CUBE')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all ${step2Mode === 'CUBE' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><Box size={14} /> 3D Cube</button>
                                        <button onClick={() => setStep2Mode('REF')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all ${step2Mode === 'REF' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><ScanEye size={14} /> Ref Analysis</button>
                                    </div>
                                    
                                    {step2Mode === 'CUBE' && (
                                        <div className="animate-in fade-in zoom-in-95 duration-200">
                                            <CameraMannequinControl onChange={handleCameraChange} />
                                        </div>
                                    )}
                                    
                                    {step2Mode === 'REF' && (
                                        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
                                                <label className="text-xs font-semibold text-slate-400 mb-2 block">Upload Composition Reference <span className="text-amber-500 text-[9px]">(Max 10MB)</span></label>
                                                <ReferenceUploader title="Camera Ref" images={step2RefImage ? [step2RefImage] : []} onImagesChange={(imgs) => setStep2RefImage(imgs.length > 0 ? imgs[0] : null)} maxImages={1} />
                                            </div>
                                            {step2RefImage && (
                                                <button 
                                                    onClick={handleAnalyzeComposition} 
                                                    disabled={isAnalyzingComposition} 
                                                    className="w-full py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all"
                                                >
                                                    {isAnalyzingComposition ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                                    {isAnalyzingComposition ? 'Analyzing...' : 'Analyze Composition'}
                                                </button>
                                            )}
                                            <div>
                                                <label className="text-[10px] font-semibold text-slate-500 mb-1 flex justify-between">
                                                    <span>Camera Prompt</span>
                                                    <span className="text-purple-400">{step2Prompt ? 'Active' : ''}</span>
                                                </label>
                                                <textarea value={step2Prompt} onChange={(e) => setStep2Prompt(e.target.value)} placeholder={isAnalyzingComposition ? "Analyzing..." : "Analysis result will appear here."} className={`w-full h-24 bg-slate-800 border ${step2Mode === 'REF' && step2Prompt ? 'border-purple-500/50' : 'border-slate-600'} rounded p-2 text-sm text-slate-200 focus:border-purple-500 outline-none resize-none custom-scrollbar`} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        {/* Removed Additional Action Instructions div */}
                    </div>
                )}
                {currentStep === ModelGenerationStep.STEP3_POSE && (
                    <div className="space-y-6">
                        <div className={`bg-slate-900 p-4 rounded-xl border transition-colors ${step2SelectedImage ? 'border-blue-500/30' : 'border-slate-800'}`}>
                            <h3 className="text-xs font-bold text-blue-400 uppercase mb-2 flex justify-between items-center">
                                Character Source 
                                <span className="text-amber-500 text-[9px] normal-case font-normal">(Max 10MB)</span>
                                <div className="flex items-center gap-2">
                                    {step2SelectedImage && (
                                        <button onClick={() => setStep2SelectedImage(null)} className="text-[10px] text-red-400 hover:text-red-300 underline flex items-center gap-1">
                                            <Trash2 size={10} /> Remove
                                        </button>
                                    )}
                                    <button onClick={() => step3SourceInputRef.current?.click()} className="text-[10px] text-slate-400 hover:text-white underline flex items-center gap-1">
                                        <Upload size={10} /> Upload
                                    </button>
                                </div>
                            </h3>
                            <div onClick={() => step3SourceInputRef.current?.click()} className={`cursor-pointer group relative rounded-lg overflow-hidden border transition-colors ${step2SelectedImage ? 'border-slate-700/50 hover:border-blue-500' : 'border-slate-800 hover:border-slate-700'}`}>
                                {step2SelectedImage ? (
                                    <>
                                        <img src={step2SelectedImage} className="w-full aspect-[3/4] object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Source" />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-xs font-medium text-white flex items-center gap-1"><Upload size={12} /> Change Image</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-xs gap-2 bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                                        <User size={24} className="opacity-50" />
                                        <span>Click to Upload Character</span>
                                    </div>
                                )}
                            </div>
                            <input type="file" ref={step3SourceInputRef} onChange={handleStep3SourceUpload} className="hidden" accept="image/*" />
                        </div>
                        
                        <div className="pt-4 border-t border-slate-700">
                            <div onClick={() => setUseFaceConsistency(!useFaceConsistency)} className="flex items-center gap-2 cursor-pointer mb-3 select-none">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${useFaceConsistency ? 'bg-blue-600 border-blue-500' : 'bg-slate-800 border-slate-600'}`}>
                                    {useFaceConsistency && <Check size={12} className="text-white" />}
                                </div>
                                <span className={`text-sm font-semibold ${useFaceConsistency ? 'text-blue-400' : 'text-slate-400'}`}>Use Face Consistency References</span>
                            </div>
                            {useFaceConsistency && (
                                <div className="space-y-4 pl-2 animate-in slide-in-from-top-2 duration-200">
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 mb-2 block">Multi-Angle Face Images <span className="text-amber-500 text-[9px]">(Max 3, 10MB each)</span></label>
                                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                            {faceConsistencyImages.map((img, idx) => (
                                                <div key={idx} className="relative w-20 h-20 flex-shrink-0 group rounded-lg overflow-hidden border border-slate-600">
                                                    <img src={img} className="w-full h-full object-cover" alt={`Face Ref ${idx + 1}`} />
                                                    <button onClick={(e) => { e.stopPropagation(); removeFaceConsistencyImage(idx); }} className="absolute top-1 right-1 p-1 bg-red-600/90 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg z-10"><X size={10} /></button>
                                                </div>
                                            ))}
                                            {faceConsistencyImages.length < 3 && (
                                                <div onClick={() => faceConsistencyInputRef.current?.click()} className="w-20 h-20 flex-shrink-0 border border-dashed border-slate-600 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-slate-800 hover:border-blue-500 transition-all bg-slate-900/50">
                                                    <Upload size={14} className="text-slate-500" />
                                                    <span className="text-[9px] text-slate-500">Add Image</span>
                                                </div>
                                            )}
                                        </div>
                                        <input type="file" ref={faceConsistencyInputRef} onChange={handleFaceConsistencyUpload} className="hidden" accept="image/*" multiple />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Pose Details (Optional)</label><textarea placeholder="e.g. Walking towards camera..." value={posePrompt} onChange={(e) => setPosePrompt(e.target.value)} className={`w-full h-24 bg-slate-800 border ${isAnalyzingPose ? 'border-purple-500 animate-pulse' : 'border-slate-600'} rounded p-2 text-sm focus:border-blue-500 outline-none resize-none custom-scrollbar`} disabled={isAnalyzingPose} /></div>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2">Pose Reference (Image) <span className="text-amber-500 text-[9px] normal-case font-normal">(Max 10MB)</span></h3>
                            <div onClick={() => poseInputRef.current?.click()} className="border-2 border-dashed border-slate-600 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800 hover:border-blue-500 transition-all relative group">
                                {poseRefImage ? (
                                    <>
                                        <img src={poseRefImage} className="h-40 object-contain rounded opacity-90 group-hover:opacity-100 transition-opacity" alt="Pose Ref" />
                                        <button onClick={(e) => { e.stopPropagation(); setPoseRefImage(null); if (poseInputRef.current) poseInputRef.current.value = ''; }} className="absolute top-2 right-2 p-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg z-10"><X size={14} /></button>
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-xs text-white font-bold flex items-center gap-1"><Upload size={14}/> Change</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="mb-2 text-slate-400" />
                                        <span className="text-xs text-slate-500">Upload Pose Image</span>
                                    </>
                                )}
                            </div>
                            <input type="file" ref={poseInputRef} onChange={handlePoseUpload} className="hidden" accept="image/*" />
                            
                            {poseRefImage && (
                                <div className="mt-3">
                                    <button 
                                        onClick={handleAnalyzePose} 
                                        disabled={isAnalyzingPose}
                                        className={`w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${isAnalyzingPose ? 'bg-purple-900 text-purple-300' : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:scale-[1.02]'}`}
                                    >
                                        {isAnalyzingPose ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
                                        {isAnalyzingPose ? 'Extracting Pose...' : 'Analyze Pose (Skeleton Only)'}
                                    </button>
                                </div>
                            )}
                        </div>

                         <div className="pt-4 border-t border-slate-700">
                            <div onClick={() => setChangeBackground(!changeBackground)} className="flex items-center gap-2 cursor-pointer mb-3 select-none">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${changeBackground ? 'bg-blue-600 border-blue-500' : 'bg-slate-800 border-slate-600'}`}>
                                    {changeBackground && <Check size={12} className="text-white" />}
                                </div>
                                <span className={`text-sm font-semibold ${changeBackground ? 'text-blue-400' : 'text-slate-400'}`}>Change Background</span>
                            </div>
                            {changeBackground && (
                                <div className="space-y-4 pl-2 animate-in slide-in-from-top-2 duration-200">
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 mb-2 block">Background Reference <span className="text-amber-500 text-[9px]">(Max 10MB)</span></label>
                                        <div onClick={() => backgroundInputRef.current?.click()} className="border border-dashed border-slate-600 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-800 hover:border-blue-500 transition-all bg-slate-900/50">
                                            {backgroundReferenceImage ? (
                                                <div className="flex items-center gap-2 w-full">
                                                    <img src={backgroundReferenceImage} className="w-8 h-8 rounded object-cover" alt="BG Ref" />
                                                    <span className="text-xs text-green-400 flex-1 truncate">BG Ref Uploaded</span>
                                                    <button onClick={(e) => { e.stopPropagation(); setBackgroundReferenceImage(null); }} className="p-1 text-slate-400 hover:text-white">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <ImageIcon size={16} className="text-slate-500" />
                                                    <span className="text-xs text-slate-500">Upload Environment</span>
                                                </>
                                            )}
                                        </div>
                                        <input type="file" ref={backgroundInputRef} onChange={handleBackgroundUpload} className="hidden" accept="image/*" />
                                    </div>
                                    {backgroundReferenceImage && (
                                        <div className="flex justify-end">
                                            <button 
                                                onClick={handleAnalyzeBackground} 
                                                disabled={isAnalyzingBackground} 
                                                className="text-[10px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-3 py-1.5 rounded flex items-center gap-1.5 transition-all shadow-md"
                                            >
                                                {isAnalyzingBackground ? <Loader2 size={12} className="animate-spin" /> : <ScanSearch size={12} />}
                                                Analyze Background
                                            </button>
                                        </div>
                                    )}
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Background Prompt</label>
                                        <textarea 
                                            placeholder="e.g. Neon city street..." 
                                            value={backgroundPrompt} 
                                            onChange={(e) => setBackgroundPrompt(e.target.value)} 
                                            className="w-full h-24 bg-slate-800 border border-slate-600 rounded p-2 text-sm focus:border-blue-500 outline-none resize-none" 
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <div className="mt-8 pt-6 border-t border-slate-700">
                    <div className="mb-4">
                        <label className="text-xs text-slate-500 block mb-1">Resolution</label>
                        <div className="grid grid-cols-3 gap-1">
                            {(['1K', '2K', '4K'] as Resolution[]).map(r => (
                                <button 
                                    key={r} 
                                    onClick={() => handleResolutionChange(r)} 
                                    className={`py-1 text-xs rounded ${resolution === r ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mb-4">
                        <label className="text-xs text-slate-500 block mb-1">Quantity</label>
                        <input type="range" min={1} max={4} value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="w-full accent-blue-500" />
                        <div className="text-right text-xs text-slate-400">{quantity} images</div>
                    </div>
                    {isGenerating ? (
                        <button onClick={handleCancel} className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg transition-all bg-red-600 hover:bg-red-700 text-white animate-pulse">
                            <Square size={20} fill="currentColor" /> Stop Generation
                        </button>
                    ) : (
                        <button 
                            onClick={handleGenerate} 
                            disabled={(currentStep === ModelGenerationStep.STEP2_MULTIVIEW && !step1SelectedImage) || (currentStep === ModelGenerationStep.STEP3_POSE && !step2SelectedImage)} 
                            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg transition-all bg-gradient-to-r from-blue-500 via-indigo-600 to-blue-600 hover:shadow-blue-900/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:grayscale`}
                        >
                            <Wand2 /> Generate
                        </button>
                    )}
                    {error && <p className="text-xs text-red-400 mt-2 text-center">{error}</p>}
                </div>
            </div>
        </div>
        <div className="flex-1 relative flex flex-col">
            <div className="pt-8 pb-4 bg-[#0f172a] z-10">{renderStepIndicator()}</div>
            <div className="px-4 md:px-10 mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 h-10">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">Generation History</h3>
                {displayItems.length > 0 && (
                    <div className="flex items-center gap-2">
                        {isSelectionMode ? (
                            <>
                                <span className="text-sm font-bold text-blue-400 mr-2">{selectedIds.size} Selected</span>
                                <button onClick={handleSelectAll} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 border border-slate-600">All</button>
                                <button onClick={handleDeselectAll} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 border border-slate-600">None</button>
                                <button onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }} className="p-1.5 hover:bg-slate-700 rounded-full text-slate-400"><X size={18} /></button>
                            </>
                        ) : (
                            <button onClick={() => setIsSelectionMode(true)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm flex items-center gap-2 transition-colors" >
                                <CheckSquare size={16} /> Select
                            </button>
                        )}
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-y-auto px-4 md:px-10 pb-20 custom-scrollbar">
                {!isGenerating && displayItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-30 mt-20">
                        <Wand2 size={64} className="mb-4" />
                        <p className="text-xl font-light">Ready to Generate {currentStep}</p>
                    </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {displayItems.map((item: any, idx) => { 
                        if ('type' in item && item.type === 'placeholder') return (
                            <div key={item.id} className="aspect-[3/4] bg-slate-800 rounded-xl overflow-hidden border border-slate-700 animate-pulse relative">
                                <div className="absolute inset-0 bg-slate-700/50 backdrop-blur-xl flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="animate-spin text-blue-500" size={32} />
                                    <span className="text-xs text-blue-300 font-medium">Generating...</span>
                                </div>
                            </div>
                        ); 
                        const realItem = item as GenerationHistoryItem; 
                        const isSelected = selectedIds.has(realItem.id); 
                        return (
                            <div key={realItem.id} className={`relative group flex flex-col bg-slate-900 rounded-xl overflow-hidden border-2 transition-all cursor-pointer animate-in fade-in zoom-in-95 duration-300 h-fit ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/20' : ((currentStep === ModelGenerationStep.STEP1_IDENTITY && step1SelectedImage === realItem.base64Data) || (currentStep === ModelGenerationStep.STEP2_MULTIVIEW && step2SelectedImage === realItem.base64Data)) ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'border-slate-700 hover:border-blue-400'}`} onClick={isSelectionMode ? () => toggleSelection(realItem.id) : () => setSelectedModalItem(realItem)}>
                                {isSelectionMode && (
                                    <div className="absolute top-2 left-2 z-20">
                                        <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors shadow-sm ${isSelected ? 'bg-blue-600 border-blue-500' : 'bg-black/50 border-white/30 backdrop-blur'}`}>
                                            {isSelected && <CheckSquare size={14} className="text-white" />}
                                        </div>
                                    </div>
                                )}
                                <div className="absolute top-2 right-2 z-[100] flex flex-col gap-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                                    {realItem.isUploading && (
                                        <div className="p-2 bg-blue-600/80 text-white rounded-full backdrop-blur-md shadow-lg flex items-center justify-center animate-pulse" title="Syncing to Cloud">
                                            <CloudUpload size={16} />
                                        </div>
                                    )}
                                    {!isSelectionMode && (
                                        <div className="flex flex-col gap-2 items-end">
                                            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownload(realItem.base64Data, 'model'); }} className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-opacity opacity-0 group-hover:opacity-100 cursor-pointer shadow-lg pointer-events-auto" title="Save Image">
                                                <Download size={16} />
                                            </button>
                                            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteItem(realItem.id); }} className={`p-2 bg-black/60 hover:bg-red-600 text-white rounded-full backdrop-blur-md transition-opacity opacity-0 group-hover:opacity-100 cursor-pointer shadow-lg pointer-events-auto`} title="Move to Trash">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {realItem.angle && (
                                    <div className="w-full h-6 py-0.5 px-2 flex items-center justify-between shrink-0 z-10 bg-slate-900 pl-8">
                                        <span className="text-[9px] font-bold text-blue-400 tracking-wider uppercase">{realItem.angle.replace('_', ' ')}</span>
                                    </div>
                                )}
                                <div className={realItem.angle ? "px-1.5 pb-1.5 w-full" : "w-full"}>
                                    <div className={`relative w-full aspect-[3/4] overflow-hidden bg-black ${realItem.angle ? 'rounded-lg' : 'rounded-b-lg'} ${!realItem.angle ? 'rounded-t-lg' : ''}`}>
                                        <img src={realItem.tempUrl || realItem.base64Data} className="w-full h-full object-cover" alt="Gen" />
                                        
                                        {/* Selected Source Badge */}
                                        {((currentStep === ModelGenerationStep.STEP1_IDENTITY && step1SelectedImage === realItem.base64Data) || (currentStep === ModelGenerationStep.STEP2_MULTIVIEW && step2SelectedImage === realItem.base64Data)) && (
                                            <div className="absolute top-2 left-2 bg-green-600 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-lg flex items-center gap-1 z-20 border border-green-400/50">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                                SOURCE
                                            </div>
                                        )}
                                        {realItem.resolution && (
                                            <span className="absolute top-2 left-2 text-[9px] bg-black/30 px-1.5 py-0.5 rounded text-white backdrop-blur-md border border-white/10 z-10">{realItem.resolution}</span>
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 z-10 pointer-events-none">
                                            {!isSelectionMode && (
                                                <div className="flex flex-col gap-2 mt-auto pointer-events-auto">
                                                    {currentStep === ModelGenerationStep.STEP1_IDENTITY && (realItem.viewType === 'UPPER_BODY' || realItem.viewType === 'FACE_ZOOM') && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleImageAction(realItem, 'TO_FULL_BODY'); }} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-105">
                                                            <Expand size={14} /> To Full Body
                                                        </button>
                                                    )}
                                                    <button onClick={(e) => { e.stopPropagation(); handleImageAction(realItem, 'USE_AS_BASE'); }} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-105">
                                                        <Shirt size={14} /> Use as Base
                                                    </button>
                                                    {currentStep === ModelGenerationStep.STEP1_IDENTITY && (
                                                        <div className="flex gap-2 w-full">
                                                            <button onClick={(e) => { e.stopPropagation(); handleImageAction(realItem, 'GO_TO_STEP2'); }} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold flex items-center justify-center gap-1 shadow-lg transition-transform hover:scale-105">
                                                                <Camera size={12} /> Step 2
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleImageAction(realItem, 'GO_TO_STEP3'); }} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold flex items-center justify-center gap-1 shadow-lg transition-transform hover:scale-105">
                                                                <Move size={12} /> Step 3
                                                            </button>
                                                        </div>
                                                    )}
                                                    {currentStep === ModelGenerationStep.STEP2_MULTIVIEW && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleImageAction(realItem, 'GO_TO_STEP3'); }} className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-105">
                                                            <ArrowRight size={14} /> Next Step
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ); 
                    })}
                </div>
            </div>
            {selectedIds.size > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-md border border-slate-600 rounded-2xl shadow-2xl p-2 px-4 flex items-center gap-4 z-50 animate-in slide-in-from-bottom-6">
                    <span className="text-sm font-bold text-white mr-2">{selectedIds.size} Selected</span>
                    <div className="h-6 w-px bg-slate-600"></div>
                    <button onClick={handleBulkDelete} disabled={isDeleting} className="flex flex-col items-center gap-1 text-slate-300 hover:text-red-400 p-2 rounded transition-colors group disabled:opacity-50">
                        {isDeleting ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} className="group-hover:scale-110 transition-transform" />}
                        <span className="text-[10px] font-medium">{isDeleting ? 'Deleting' : 'Delete'}</span>
                    </button>
                </div>
            )}
        </div>
        {selectedModalItem && !isSelectionMode && (
            <ImageModal 
                isOpen={true} 
                base64Data={selectedModalItem.base64Data} 
                prompt={selectedModalItem.userPrompt} 
                referenceImages={selectedModalItem.referenceImages} 
                coreStats={selectedModalItem.coreStats} 
                viewType={selectedModalItem.viewType} 
                faceDetail={selectedModalItem.faceDetail} 
                hairDetail={selectedModalItem.hairDetail} 
                bodyDetail={selectedModalItem.bodyDetail}
                poseDetail={selectedModalItem.poseDetail} 
                age={selectedModalItem.age} 
                faceReferenceWeight={selectedModalItem.faceReferenceWeight} 
                onClose={() => setSelectedModalItem(null)} 
                onPrev={handleModalPrev} 
                onNext={handleModalNext} 
                hasPrev={hasNavigation} 
                hasNext={hasNavigation} 
                onUseAsBase={() => handleImageAction(selectedModalItem, 'USE_AS_BASE')} 
                onNextStep={() => { 
                    if (currentStep === ModelGenerationStep.STEP1_IDENTITY) handleImageAction(selectedModalItem, 'GO_TO_STEP2'); 
                    else if (currentStep === ModelGenerationStep.STEP2_MULTIVIEW) handleImageAction(selectedModalItem, 'GO_TO_STEP3'); 
                }} 
                onSkipToStep3={currentStep === ModelGenerationStep.STEP1_IDENTITY ? () => handleImageAction(selectedModalItem, 'GO_TO_STEP3') : undefined} 
                onToFullBody={currentStep === ModelGenerationStep.STEP1_IDENTITY && (selectedModalItem.viewType === 'UPPER_BODY' || selectedModalItem.viewType === 'FACE_ZOOM') ? () => handleImageAction(selectedModalItem, 'TO_FULL_BODY') : undefined} 
                showNextStep={currentStep !== ModelGenerationStep.STEP3_POSE} 
            />
        )}
    </div>
  );
};

export default ModelGenerator;
