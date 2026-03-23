
export interface ReferenceImage {
  id: string;
  file?: File;
  url: string;
  base64: string;
  mimeType: string;
}

export interface GeneratedImage {
  id: string; // Local Stable ID (UUID)
  url: string;
  prompt: string;
  resolution?: ImageResolution;
  category?: FashionCategory; // Added for DB persistence context
  timestamp?: number; // Added for DB persistence
  folderName?: string; // New: Folder organization (Default: 'All')
  isPublic?: boolean;  // New: Community sharing (Default: false)
  isFavorite?: boolean; // New: Favorites feature (Default: false)
  storagePath?: string; // New: For Hard Delete functionality
  
  // Optimistic UI Props
  isUploading?: boolean;
  tempUrl?: string; // Blob URL for immediate display
}

export enum AppStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

// Fix: Added DESIGN_SYNTH to FashionCategory to support Professional Design Synthesis feature
export type FashionCategory = 'TOPS' | 'BOTTOMS' | 'SHOES' | 'ACCESSORIES' | 'MIX' | 'ANALYSIS' | 'DESIGN_SYNTH';

export type ImageResolution = '1K' | '2K' | '4K';
export type Resolution = ImageResolution; // Alias for compatibility

// Model Generation Types
export enum Gender {
  Female = 'Female',
  Male = 'Male'
}

export enum Ethnicity {
  White = 'White',
  Asian = 'Asian',
  Black = 'Black',
  Latino = 'Latino',
  MiddleEastern = 'Middle Eastern',
  Indian = 'Indian',
  Mixed = 'Mixed'
}

export enum Physique {
  Standard = 'Standard',
  Athletic = 'Athletic',
  Slim = 'Slim',
  Curvy = 'Curvy'
}

// v2.1 Workflow Types
export enum ModelGenerationStep {
  STEP1_IDENTITY = 'IDENTITY',
  STEP2_MULTIVIEW = 'MULTIVIEW',
  STEP3_POSE = 'POSE'
}

export type ModelViewType = 'FULL_BODY' | 'UPPER_BODY' | 'FACE_ZOOM';

export type ModelAngle = 'FRONT' | 'UPPER' | 'FRONT_RIGHT' | 'FRONT_LEFT' | 'SIDE' | 'BACK' | 'CUSTOM';

export type ReferenceWeight = 'LOW' | 'MID' | 'HIGH';

export interface ModelConfig {
  step: ModelGenerationStep;
  // Step 1 Props
  gender: Gender;
  ethnicity: Ethnicity;
  physique: Physique;
  height: number;
  viewType: ModelViewType;
  facePrompt: string;
  faceReferenceImage?: string; // New in v2.1 update
  faceReferenceWeight?: ReferenceWeight; // New: Reference Weight Slider
  hairPrompt: string;
  bodyPrompt?: string; // New: Body Details
  agePrompt: string; // New in v2.1
  
  // Step 2 Props
  sourceImage?: string; // Base64 from previous step
  targetAngles: ModelAngle[];
  step2Prompt?: string; // New: Additional prompt for Step 2
  
  // Step 3 Props
  poseReferenceImage?: string; // Base64
  posePrompt?: string; // User defined pose description
  faceConsistencyImages?: string[]; // New: Multi-angle face references
  
  // Step 3 Background Props (New)
  changeBackground?: boolean;
  backgroundPrompt?: string;
  backgroundReferenceImage?: string; // Base64
  
  // Advanced Composition Settings (New)
  lightingMatch?: number;
  shadowIntensity?: number;

  // Global
  quantity: number;
  resolution: Resolution;
}

export interface GenerationHistoryItem {
  id: string; // Local Stable ID (UUID)
  base64Data: string;
  userPrompt: string;
  timestamp: number;
  gender: Gender;
  step: ModelGenerationStep; // Track which step created this
  resolution?: Resolution;
  referenceImages?: string[]; // Array of base64 strings used as reference
  angle?: string; // Metadata for Step 2 angles
  
  // Detailed Configuration Metadata
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

  // Optimistic UI Props
  isUploading?: boolean;
  tempUrl?: string; // Blob URL
  storagePath?: string; // New: For Hard Delete functionality
}

// Deep Scan Types
export type DeepScanType = 'PRODUCT' | 'MODEL' | 'POSE' | 'BACKGROUND' | 'LIGHTING';

export interface DeepScanResult {
    english: string;
    korean: string;
}
