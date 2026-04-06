
import { GoogleGenAI, Type } from "@google/genai";
import { ModelConfig, ModelGenerationStep, ReferenceImage, DeepScanType, DeepScanResult, Physique, ImageResolution } from "../types";
import { COMMON_NEGATIVE_PROMPT, MALE_NEGATIVE_PROMPT, FEMALE_NEGATIVE_PROMPT, BODY_RATIO_PROMPT, HIGH_QUALITY_PROMPT, DEFAULT_FEMALE_OUTFIT, DEFAULT_MALE_OUTFIT, IDENTITY_LOCK_INSTRUCTION } from "../constants";

export const getApiKey = () => {
  if (typeof window === 'undefined') return process.env.API_KEY || process.env.GEMINI_API_KEY;

  // 1. Check for manually entered key in localStorage (support both cases for compatibility)
  const customKey = localStorage.getItem('custom_gemini_api_key') || localStorage.getItem('CUSTOM_GEMINI_API_KEY');
  
  // 2. Check for environment key (Vite style for client-side)
  const viteKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY;
  
  // 3. Check for process.env (AI Studio style)
  const envKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  
  return customKey || viteKey || envKey;
};

export const hasAnyApiKey = async (): Promise<boolean> => {
  // 1. Check local/env sources
  if (getApiKey()) return true;

  // 2. Check AI Studio source
  try {
    const aiStudio = (window as any).aistudio || (window.parent as any).aistudio;
    if (aiStudio && aiStudio.hasSelectedApiKey) {
      return await aiStudio.hasSelectedApiKey();
    }
  } catch (e) {
    console.warn("AI Studio Key check failed:", e);
  }

  return false;
};

const ensureApiKey = async () => {
  if (await hasAnyApiKey()) return;

  // If we are in AI Studio, try to open the selector
  try {
    const aiStudio = (window as any).aistudio || (window.parent as any).aistudio;
    if (aiStudio && aiStudio.openSelectKey) {
      await aiStudio.openSelectKey();
    }
  } catch (e) {
    console.warn("API Key Selection UI not available in this context.");
  }
};

const getClient = () => {
  const key = getApiKey();
  
  if (!key) throw new Error("API Key not found. Please set your API key in the header.");
  return new GoogleGenAI({ apiKey: key });
};

export const validateApiKey = async (key: string): Promise<boolean> => {
  const trimmedKey = key?.trim();
  if (!trimmedKey || trimmedKey.length < 30) {
    console.warn("[API Validation] Key is too short.");
    return false;
  }
  
  // Basic format check for Gemini keys
  if (!trimmedKey.startsWith('AIzaSy')) {
    console.warn("[API Validation] Key does not start with AIzaSy.");
    return false;
  }
  
  try {
    // [STRICTEST CHECK] Bypass SDK and call Google's API endpoint directly via fetch.
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}&t=${Date.now()}`;
    
    console.log("[API Validation] Sending direct request to Google API...");
    const response = await fetch(url);
    
    if (response.status === 200) {
      const data = await response.json();
      if (data && data.models && data.models.length > 0) {
        console.log("[API Validation] Success: Google server confirmed key is valid.");
        return true;
      }
      return false;
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[API Validation] Denied by Google (Status: ${response.status}):`, errorData);
      
      // If it's a 403 or 400, the key is definitely invalid.
      if (response.status === 403 || response.status === 400) {
        return false;
      }
      
      // For other statuses (like 500s or 429s), we might want to be more lenient 
      // if the key looks correct, but for now we'll stick to strict validation.
      return false;
    }
  } catch (error: any) {
    console.error("[API Validation] Network/CORS Error during validation:", error.message || error);
    
    // [HEURISTIC FALLBACK]
    // If it's a network error (like CORS or offline), and the key looks like a Gemini key,
    // we might want to allow it because the validation itself might be blocked by the environment.
    // This is common on some deployment platforms or restricted networks.
    if (error.message?.includes('Failed to fetch') || error.name === 'TypeError') {
      console.warn("[API Validation] Network error detected. Falling back to format-only validation.");
      return trimmedKey.startsWith('AIzaSy') && trimmedKey.length >= 35;
    }
    
    return false;
  }
};

const fileToPart = (data: string, mimeType: string = "image/png") => {
  const cleanData = data.includes(',') ? data.split(',')[1] : data;
  return {
    inlineData: {
      data: cleanData,
      mimeType: mimeType.includes('heartbeat') ? 'image/png' : (mimeType.includes('jpeg') ? 'image/jpeg' : 'image/png')
    }
  };
};

const handleGeminiError = (err: any) => {
  console.error("[GeminiService] Error:", err);
  
  const message = err.message || String(err);
  
  // Check for quota exhaustion
  if (message.includes("RESOURCE_EXHAUSTED") || message.includes("quota") || message.includes("429")) {
    throw new Error("API 사용량이 일일 할당량을 초과했습니다. (Quota Exceeded) 내일 다시 시도하거나 다른 API 키를 사용해 주세요.");
  }
  
  // Check for safety filters
  if (message.includes("SAFETY") || message.includes("blocked")) {
    throw new Error("안전 필터에 의해 요청이 차단되었습니다. 다른 이미지나 프롬프트를 시도해 주세요.");
  }

  // Check for invalid API key
  if (message.includes("API_KEY_INVALID") || message.includes("403") || message.includes("Requested entity was not found")) {
    throw new Error("API 키가 유효하지 않거나 권한이 없습니다. 설정에서 API 키를 확인해 주세요.");
  }

  throw err;
};

/**
 * Gemini 3 Pro (Text)를 사용한 고도화된 패션 디자인 합성
 */
export const synthesizeFashionDesign = async (images: ReferenceImage[], userInstruction: string): Promise<string> => {
  await ensureApiKey();
  const ai = getClient();
  const parts: any[] = images.map(img => fileToPart(img.base64, img.mimeType));
  
  const prompt = `
[ROLE]: Senior Fashion Technical Designer.
[TASK]: Synthesize provided visual references into a STRICT technical fashion design concept. 

[STRICT FIDELITY RULES]:
1. **ZERO CREATIVITY ON DESIGN**: Do NOT change the silhouette, seams, or details. Replicate perfectly.
2. **FABRIC MATCH**: Use Casual Cotton Twill for shorts. Keep exact fabric texture and color.
3. **FOOTWEAR**: Must include Minimalist White Leather Sneakers.

[MANDATORY ANATOMICAL RULES - HEROIC RATIO V9.5]:
- **HEAD (ULTRA-CRITICAL)**: Super-micro head. Width of shoulders must be exactly 3.5 times the width of the head.
- **UPPER BODY**: Maintain a sleek, lean silhouette. DO NOT make the upper body bulky or over-muscular.
- **LEGS (CRITICAL)**: Maximally elongated legs. 
- **WAIST**: Raise the waistline by 3cm higher than natural navel to lengthen the legs further.
- **FACE**: Shortest compact chin and jawline. NO long face.
- **PANTS**: Cotton Shorts (Not formal). Hemline is 3cm shorter than mid-thigh.
- **FRAME**: Extra-Broad Square Horizontal Shoulders (직각 어깨).
- **TUCK-IN**: (ABSOLUTE) Shirt must be deeply tucked into shorts.

[USER INSTRUCTION]: "${userInstruction || "Replicate with 3.5:1 shoulder-to-head width ratio, sleek non-bulky upper body, ultra-long legs (1:12 ratio), high waist (+3cm), and shorter cotton shorts."}"
[OUTPUT]: Technical prompt starting with "[SYNTHESIZED DESIGN]:"
`;

  parts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [{ role: 'user', parts }]
    });

    return response.text || "";
  } catch (err) {
    throw handleGeminiError(err);
  }
};

/**
 * 패션 모델 생성 단계별 엔진 (Gemini 3 Pro Image)
 */
export const generateFashionModelStep = async (
  config: ModelConfig,
  signal: AbortSignal,
  onImageGenerated: (base64: string, angle?: string) => Promise<void>
) => {
  console.log("[GeminiService] generateFashionModelStep started", { step: config.step, angles: config.targetAngles });
  await ensureApiKey();
  const modelName = 'gemini-3.1-flash-image-preview';
  const ai = getClient();
  
  let viewConstraint = "";
  if (config.viewType === 'FULL_BODY') {
    viewConstraint = "(ABSOLUTE CRITICAL) FULL LENGTH DISTANT SHOT. MUST SHOW THE ENTIRE BODY FROM TOP OF HAIR TO THE SOLES OF THE SHOES. NO CROPPING AT ALL. (MANDATORY) Leave 10% empty space at the bottom of the frame below the shoes AND 10% empty space at the top of the frame above the head. WHITE LEATHER SNEAKERS MUST BE FULLY VISIBLE. THE MODEL SHOULD BE CENTERED AND OCCUPY THE FULL HEIGHT OF THE FRAME MINUS PADDING. (ULTRA-HIGH RESOLUTION:9.5), (MASTERPIECE:9.5), (8K RESOLUTION:9.5), (SHARP FOCUS:9.5)";
  } else if (config.viewType === 'UPPER_BODY') {
    viewConstraint = "(ABSOLUTE CRITICAL) UPPER BODY MEDIUM SHOT. Focus ONLY from mid-thigh to head. (MANDATORY) NO LEGS, NO FEET, NO SHOES visible. The shot must end at the mid-thigh or waist. DO NOT GENERATE A FULL BODY SHOT. DO NOT ZOOM IN TOO MUCH ON THE FACE; ensure the upper garment is clearly visible from waist up.";
  } else if (config.viewType === 'FACE_ZOOM') {
    viewConstraint = "(ABSOLUTE CRITICAL) PROFESSIONAL HEADSHOT. Focus ONLY on the head and shoulders. The face should occupy 35-45% of the frame height (balanced portrait framing). (MANDATORY) NO WAIST, NO HIPS, NO LEGS visible. Professional portrait framing with balanced head space at the top. Centered composition, looking directly at the camera, neutral studio background. (CRITICAL) Maintain the exact 3:4 aspect ratio framing of a professional headshot.";
  }

  const isMale = config.gender === 'Male';
  
  let physiqueInstruction = "";
  let physiqueNegativePrompt = "";
  if (config.physique === 'Slim') {
    physiqueInstruction = isMale 
      ? "Extremely lean and slender frame, narrow waist, long and thin limbs, minimal muscle bulk."
      : "Very slender and delicate frame, narrow waist, thin limbs, elegant and lean physique.";
  } else if (config.physique === 'Athletic') {
    physiqueInstruction = isMale
      ? "Strongly defined muscles, toned V-taper frame, broad shoulders, athletic and fit build."
      : "Well-toned and defined muscles, athletic build, firm and fit physique, slightly broader shoulders.";
    physiqueNegativePrompt = "skinny, weak, fragile, no muscle, ";
  } else if (config.physique === 'Curvy') {
    physiqueInstruction = isMale
      ? "More robust and fuller build, wider frame, solid and substantial physique."
      : "Pronounced hourglass figure, wider hips, fuller bust, soft and feminine curves.";
    physiqueNegativePrompt = "skinny, flat chest, narrow hips, ";
  } else {
    physiqueInstruction = "Balanced and natural proportions, standard healthy build, average muscle tone.";
  }

  // Adjust negative prompt based on physique to avoid conflicts
  let dynamicNegativePrompt = isMale ? MALE_NEGATIVE_PROMPT : FEMALE_NEGATIVE_PROMPT;
  if (config.physique === 'Athletic') {
    dynamicNegativePrompt = dynamicNegativePrompt
      .replace('(bulky upper body:9.5), ', '')
      .replace('(over-muscular:9.0), ', '');
  } else if (config.physique === 'Curvy') {
    dynamicNegativePrompt = dynamicNegativePrompt
      .replace('(wide torso:9.0), ', '');
  }
  dynamicNegativePrompt = physiqueNegativePrompt + dynamicNegativePrompt;

  // Split calibration into Proportions and Outfit for better consistency control
  const proportionPrompt = config.viewType === 'FACE_ZOOM'
    ? `
[PROPORTION LOCK - FACE FOCUS V9.6]
- ETHNICITY: (ABSOLUTE MANDATORY) ${config.ethnicity}. The model MUST strictly appear as ${config.ethnicity}. NO other ethnic features allowed.
- FACE STRUCTURE: (MANDATORY) Shortest compact chin and jawline. No long faces.
- FACE SIZE: (CRITICAL) Standard professional portrait framing. The face is centered and occupies about 40% of the frame height.
- SHOULDERS: ${isMale ? 'Broad Square Horizontal Shoulders' : 'Elegant high-set shoulders'}.
- BACKGROUND: Pure white studio with professional lighting.
`
    : `
[PROPORTION LOCK - HEROIC ${isMale ? 'MALE' : 'FEMALE'} BALANCE V9.6]
- ETHNICITY: (ABSOLUTE MANDATORY) ${config.ethnicity}. The model MUST strictly appear as ${config.ethnicity}. NO other ethnic features allowed.
- PHYSIQUE: ${config.physique} (${physiqueInstruction})
- HEIGHT: ${config.height}cm
- RATIO: (ABSOLUTE MANDATORY) 1:12 head-to-body height ratio. The head must be very small relative to the body to emphasize ultra-long legs.
- WIDTH RULE: (CRITICAL) Shoulder width must be exactly ${isMale ? '3.5' : '2.8'} times the head width.
- HEAD SIZE: Super-micro head aesthetic. The face should appear small and refined.
- UPPER BODY: ${config.physique === 'Athletic' ? 'Toned and defined' : 'Sleek and elegant'} frame. NOT bulky.
- FACE STRUCTURE: (MANDATORY) Shortest compact chin and jawline. No long faces.
- WAIST: (MANDATORY) Extreme raised waistline (+3cm higher than navel).
- SHOULDERS: ${isMale ? 'Extra-Broad Square Horizontal Shoulders, masculine T-shape V-taper frame' : 'Elegant high-set shoulders'}.
- BACKGROUND: Pure white studio with professional lighting.
`;

  const outfitPrompt = config.viewType === 'FACE_ZOOM' 
    ? `
[OUTFIT CALIBRATION]
- TOP: Focus on the upper part of the outfit.
- STYLE: (ABSOLUTE) T-shirt neatly styled. (Note: Lower body is out of frame)
`
    : `
[OUTFIT CALIBRATION]
- BOTTOM: ${isMale ? 'Casual Cotton Twill Shorts (Not formal). High-cropped hem raised 3cm higher than mid-thigh.' : 'High-waisted Mini Skirt.'}
- FOOTWEAR: Minimalist White Leather Sneakers.
- STYLE: (ABSOLUTE) T-shirt deeply and neatly tucked into the high-set waistband.
`;

  const calibrationPrompt = proportionPrompt + outfitPrompt;

  const commonConfig = {
    imageConfig: {
      aspectRatio: "3:4" as any,
      imageSize: config.resolution as any 
    },
    tools: [{ googleSearch: {} }],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };

  const executeGenerationTask = async (parts: any[], angle?: string) => {
    console.log(`[GeminiService] executeGenerationTask for angle: ${angle || 'N/A'}`);
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts }],
        config: commonConfig
      });

      if (!response.candidates?.[0]?.content?.parts) {
          throw new Error("No image generated. The model might have blocked the request due to safety filters.");
      }

      for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            await onImageGenerated(`data:image/png;base64,${part.inlineData.data}`, angle);
          }
      }
    } catch (err: any) {
      throw handleGeminiError(err);
    }
  };

  if (config.step === ModelGenerationStep.STEP1_IDENTITY) {
      const prompt = `
      # [STRICT IDENTITY LOCK V9.6]
      - (CRITICAL: PRESERVE REFERENCE DETAIL:9.5)
      - (ULTRA-HIGH RESOLUTION:9.5)
      - (SHARP FOCUS:9.5)
      - ETHNICITY: (ABSOLUTE MANDATORY) ${config.ethnicity}. The model MUST strictly appear as ${config.ethnicity}.
      - GENDER: ${config.gender}
      - PHYSIQUE: ${config.physique}
      - HEIGHT: ${config.height}cm
      - AGE: ${config.agePrompt || 'Young adult'}
      
      # STYLE LOCK:
      - OUTFIT: ${config.bodyPrompt || (isMale ? DEFAULT_MALE_OUTFIT : DEFAULT_FEMALE_OUTFIT)}
      - FACE: ${config.facePrompt || 'Natural and professional'}
      - HAIR: ${config.hairPrompt || 'Neat and styled'}
      ${viewConstraint}
      ${proportionPrompt}
      ${outfitPrompt}
      ${HIGH_QUALITY_PROMPT}
      # NEGATIVE: ${dynamicNegativePrompt}
      `;

      const parts: any[] = [{ text: prompt }];
      if (config.faceReferenceImage) {
          parts.push(fileToPart(config.faceReferenceImage));
          if (config.faceReferenceWeight) {
              const weightInstruction = config.faceReferenceWeight === 'HIGH' 
                  ? "\n(CRITICAL: Use Image 2 as an EXACT ID reference. Replicate the face 1:1 with MAXIMUM FIDELITY. DO NOT lose any detail from the reference.)"
                  : config.faceReferenceWeight === 'MID'
                  ? "\n(STRICT: Use Image 2 as a strong similarity reference. The face should be very similar.)"
                  : "\n(STYLE: Use Image 2 only for general vibe and style. The face can be different.)";
              parts[0].text += weightInstruction;
          }
      }

      // Sequential generation for better stability and UI feedback
      for (let i = 0; i < config.quantity; i++) {
          if (signal.aborted) break;
          await executeGenerationTask(parts);
      }

  } else if (config.step === ModelGenerationStep.STEP2_MULTIVIEW) {
      const isCustom = config.targetAngles.includes('CUSTOM');
      const anglesToGenerate = isCustom 
          ? Array(config.quantity).fill('CUSTOM') 
          : config.targetAngles;

      for (const angle of anglesToGenerate) {
        if (signal.aborted) break;
        
        const hasCustomCamera = !!config.step2Prompt;
        const isUpperShot = config.viewType !== 'FULL_BODY';
        
        const prompt = `
[TASK]: Generate a consistent catalog image of the person from Image 1.
[ANGLE]: ${angle}.
[CAMERA SETTINGS]: (CRITICAL) ${config.step2Prompt || 'Standard view.'}
[INSTRUCTION]: 
1. (MANDATORY) MAINTAIN THE EXACT OUTFIT FROM IMAGE 1. DO NOT CHANGE PANTS TO SKIRTS OR VICE VERSA.
2. (MANDATORY) MAINTAIN THE EXACT FACE AND HAIR FROM IMAGE 1.
${isUpperShot ? '3. (CRITICAL) SOURCE IS AN UPPER BODY SHOT. DO NOT GENERATE LEGS OR FEET. KEEP THE SHOT AS UPPER BODY OR CLOSE-UP.' : ''}

${hasCustomCamera ? '[STRICT]: Follow [CAMERA SETTINGS] exactly for shot size and framing, but respect the [INSTRUCTION] regarding shot consistency.' : viewConstraint}
${proportionPrompt}
${HIGH_QUALITY_PROMPT}
`;
        await executeGenerationTask([fileToPart(config.sourceImage!), { text: prompt }], angle);
      }
  } else if (config.step === ModelGenerationStep.STEP3_POSE) {
       const parts: any[] = [fileToPart(config.sourceImage!)];
       const sourceIdx = 1;
       let nextIdx = 2;
       
       let faceConsistencyPrompt = "";
       if (config.faceConsistencyImages && config.faceConsistencyImages.length > 0) {
           const faceIndices: number[] = [];
           config.faceConsistencyImages.forEach(img => {
               parts.push(fileToPart(img));
               faceIndices.push(nextIdx++);
           });
           faceConsistencyPrompt = `\n(CRITICAL IDENTITY PRESERVATION: Analyze the provided multiple face reference images (Images ${faceIndices.join(', ')}) to perfectly capture the character's unique facial features, bone structure, and identity. Even if the head angle changes due to the pose reference, the final generated face MUST strictly match the identity of these reference images.)`;
       }

       let poseIdx = -1;
       if (config.poseReferenceImage) {
           parts.push(fileToPart(config.poseReferenceImage));
           poseIdx = nextIdx++;
       }
       
       // Dynamically update the pose prompt to use correct indices
       let finalPosePrompt = config.posePrompt || "";
       let skeletalMappingInstruction = "";
       if (poseIdx !== -1) {
           // Replace "Image 1" and "Image 2" with actual indices if they were hardcoded in the component
           // The component uses "Image 1" for source and "Image 2" for pose.
           finalPosePrompt = finalPosePrompt.replace(/Image 1/g, `Image ${sourceIdx}`);
           finalPosePrompt = finalPosePrompt.replace(/Image 2/g, `Image ${poseIdx}`);
           
           // Add extra emphasis on pose following and ignoring everything else
           finalPosePrompt += `\n(STRICT POSE ADHERENCE: Use Image ${poseIdx} ONLY as a skeletal reference. Replicate every limb angle and joint position exactly. IGNORE the lighting, background, clothing, face, and image quality of Image ${poseIdx}.)`;
           skeletalMappingInstruction = `\n(MANDATORY SKELETAL MAPPING: Transfer ONLY the skeleton, body physics, and limb positions of Image ${poseIdx} onto the character from Image ${sourceIdx}. Do NOT adopt any visual style, lighting, or environmental attributes from Image ${poseIdx}.)`;
       }

       const prompt = `
[POSE]: ${finalPosePrompt}. ${skeletalMappingInstruction}
(MANDATORY) MAINTAIN THE EXACT OUTFIT, FACE, AND HAIR FROM IMAGE ${sourceIdx}.${faceConsistencyPrompt}
(STRICT PIXEL-PERFECT FIDELITY: The output MUST match the exact sharpness, skin texture density, fabric detail, and NATURAL COLOR TONE of Image 1. DO NOT increase saturation or vibrance. Ensure 1:1 clarity and color reproduction. (CRITICAL EYE POSITIONING): Ensure the iris is centered naturally. NO sanpaku eyes. NO visible white space below or above the iris unless looking up/down. Maintain ultra-sharp focus on the entire body.)
${viewConstraint}
${proportionPrompt} 
${HIGH_QUALITY_PROMPT}
`;
       parts.push({ text: prompt });

       for (let i = 0; i < config.quantity; i++) {
           if (signal.aborted) break;
           await executeGenerationTask(parts);
       }
  }
};

/**
 * 일반 의상 생성 및 합성 엔진
 */
export const generateFashionImages = async (
  prompt: string,
  images: ReferenceImage[],
  count: number = 1,
  resolution: ImageResolution = '1K',
  onImageGenerated?: (base64: string) => Promise<void>,
  signal?: AbortSignal,
  forcePro: boolean = false,
  aspectRatio: string = "3:4"
) => {
  await ensureApiKey();
  const modelName = 'gemini-3.1-flash-image-preview';
  const ai = getClient();

  const finalPrompt = forcePro 
    ? `${prompt}\n\n${HIGH_QUALITY_PROMPT}\n(NEGATIVE: ${COMMON_NEGATIVE_PROMPT})\n(CRITICAL: FULL BODY SHOT. DO NOT CROP HEAD OR FEET. LEAVE SPACE AT TOP AND BOTTOM.)`
    : `${prompt}\n(CRITICAL: HEAD SIZE REDUCED. SHOULDER WIDTH = 3.5X HEAD WIDTH. SLEEK NON-BULKY FRAME. ULTRA LONG LEGS. SHORT COMPACT CHIN. EXTRA BROAD SQUARE SHOULDERS. 3CM HIGHER WAIST. 3CM SHORTER COTTON SHORTS. WHITE LEATHER SNEAKERS. FULL BODY SHOT. DO NOT CROP HEAD OR FEET. LEAVE SPACE AT TOP AND BOTTOM.)\n\n${HIGH_QUALITY_PROMPT}`;

  const parts: any[] = images.map(img => fileToPart(img.base64, img.mimeType));
  parts.push({ text: finalPrompt });

  const executeSingle = async () => {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts }],
        config: {
            imageConfig: {
                aspectRatio: aspectRatio as any,
                imageSize: resolution as any 
            },
            tools: [{ googleSearch: {} }],
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
              { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_ONLY_HIGH' }
            ]
        }
      });

      const urls: string[] = [];
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const url = `data:image/png;base64,${part.inlineData.data}`;
          urls.push(url);
          if (onImageGenerated) await onImageGenerated(url);
        }
      }
      return urls;
    } catch (err: any) {
      throw handleGeminiError(err);
    }
  };

  const tasks = [];
  const results = [];
  
  // Run tasks sequentially to avoid 502 Bad Gateway / Network Congestion with large base64 payloads
  for (let i = 0; i < count; i++) {
    if (signal?.aborted) break;
    const res = await executeSingle();
    results.push(res);
  }
  
  return results.flat();
};

/**
 * [FIX]: Analyze face features (face and hair descriptions)
 */
export const analyzeFaceFeatures = async (
  image: string,
  coreStats?: { gender: string; ethnicity: string; physique: string; height: number }
): Promise<{ face: string; hair: string }> => {
  await ensureApiKey();
  const ai = getClient();
  
  const statsContext = coreStats 
    ? `\n[STRICT CONTEXT]: The model is a ${coreStats.gender}, ${coreStats.ethnicity}, with a ${coreStats.physique} physique and ${coreStats.height}cm height. (MANDATORY): The extracted description MUST strictly align with these core stats. If the image shows different traits, prioritize the provided core stats while describing the specific facial/hair details.`
    : "";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          fileToPart(image),
          { text: `Analyze the face and hair of the person in the image. Provide a detailed description for both face and hair separately for a fashion model prompt. (CRITICAL): Focus on natural, realistic, and commercial-friendly hair styles. Avoid avant-garde, conceptual, or "hair design competition" descriptions.${statsContext}` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            face: { type: Type.STRING, description: "Detailed description of facial features" },
            hair: { type: Type.STRING, description: "Detailed description of hair style and color" }
          },
          required: ["face", "hair"]
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_ONLY_HIGH' }
        ]
      }
    });
    return JSON.parse(response.text || '{"face":"", "hair":""}');
  } catch (err) {
    throw handleGeminiError(err);
  }
};

/**
 * [FIX]: Analyze face DNA (gender, ethnicity, physique, age)
 */
export const analyzeFaceDNA = async (base64: string): Promise<{ gender: string; ethnicity: string; physique: string; age: number }> => {
  await ensureApiKey();
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          fileToPart(base64),
          { text: "Identify the gender, ethnicity (be specific: e.g., White, Black, East Asian, South Asian, Hispanic), physique (Slim, Athletic, Curvy, Standard), and age of the person in this image for fashion cataloging. Provide the most accurate assessment based on visual features." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            gender: { type: Type.STRING, description: "Female or Male" },
            ethnicity: { type: Type.STRING },
            physique: { type: Type.STRING },
            age: { type: Type.NUMBER }
          },
          required: ["gender", "ethnicity", "physique", "age"]
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_ONLY_HIGH' }
        ]
      }
    });
    return JSON.parse(response.text || '{"gender":"Female", "ethnicity":"Asian", "physique":"Slim", "age":24}');
  } catch (err) {
    throw handleGeminiError(err);
  }
};

/**
 * [FIX]: Analyze pose structure for skeletal mapping
 */
export const analyzePoseStructure = async (image: string): Promise<string> => {
  await ensureApiKey();
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          fileToPart(image),
          { text: `Analyze the pose and skeletal structure of the person in this image for SKELETAL MAPPING. Provide a technical description for an AI image generation prompt.

Focus strictly on the following:
1. **Shot Type & View**: (e.g., Full body, side view).
2. **Body Rotation & Tilt**: Precise angles of the face, torso, and hips.
3. **Limb & Joint Positioning**: Exact placement of arms, hands, legs, and feet.
4. **Weight & Balance**: Center of gravity and weight distribution.

CRITICAL RULES:
- DO NOT describe the background, environment, colors, lighting, or clothing.
- Focus ONLY on the physical pose, skeletal structure, and body angles.
- Use technical language (e.g., "torso rotated 45 degrees", "weight shifted to left leg").` }
        ]
      },
      config: {
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_ONLY_HIGH' }
        ]
      }
    });
    return response.text || "";
  } catch (err) {
    throw handleGeminiError(err);
  }
};

/**
 * [FIX]: Analyze background image for environment replication
 */
export const analyzeBackgroundImage = async (image: string): Promise<string> => {
  await ensureApiKey();
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          fileToPart(image),
          { text: "Analyze the background/environment in this image. Describe the setting, lighting, and key elements in detail for an AI image generation environment prompt." }
        ]
      }
    });
    return response.text || "";
  } catch (err) {
    throw handleGeminiError(err);
  }
};

/**
 * [FIX]: Analyze camera composition and framing
 */
export const analyzeComposition = async (image: string): Promise<string> => {
  await ensureApiKey();
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          fileToPart(image),
          { text: "Analyze the camera composition, angle, and framing of this image. Describe the shot size, camera height, and perspective in detail for consistent photography replication." }
        ]
      }
    });
    return response.text || "";
  } catch (err) {
    throw handleGeminiError(err);
  }
};

/**
 * [FIX]: Generate slight variations of existing prompts
 */
export const generatePromptVariation = async (
  prompt: string, 
  type: 'face' | 'hair',
  coreStats?: { gender: string; ethnicity: string; physique: string; height: number }
): Promise<string> => {
  await ensureApiKey();
  const ai = getClient();
  
  const statsContext = coreStats 
    ? `\n[ABSOLUTE STRICT CONSTRAINT]: Maintain the identity of a ${coreStats.gender}, ${coreStats.ethnicity}, ${coreStats.physique} physique, ${coreStats.height}cm model. DO NOT change these core attributes under any circumstances.`
    : "";

  const instruction = type === 'hair'
    ? `Generate a natural and realistic hairstyle description for a commercial fashion catalog. Avoid avant-garde, conceptual, or "hair design competition" styles. Focus on clean, wearable, and professional looks. Randomly choose from styles like: natural long waves, classic bob cut, simple sleek ponytail, straight silky hair, soft loose curls, neat low bun, or medium-length layered cut. Keep the colors natural (black, brown, blonde, etc.) and the styling polished but realistic. Original prompt for context: "${prompt}"`
    : `Give me a slight variation of the following ${type} description for a fashion model, maintaining the core style but changing minor details for diversity. Ensure the variation remains strictly within the bounds of a professional fashion model: "${prompt}"`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `${instruction}${statsContext}`
    });
    return response.text || prompt;
  } catch (err) {
    throw handleGeminiError(err);
  }
};

/**
 * [FIX]: Analyze clothing items for try-on workflows
 */
export const analyzeClothingImage = async (images: {base64: string, mimeType: string}[], category: string = 'GENERAL'): Promise<string> => {
  await ensureApiKey();
  const ai = getClient();
  const imageParts = images.map(img => fileToPart(img.base64, img.mimeType));
  
  const prompt = category === 'SHOES' 
    ? "Analyze these shoe reference images in extreme detail. Identify the silhouette, materials (leather, mesh, suede), color palette (hex codes if possible), sole structure, and any unique branding or patterns for high-fidelity replication."
    : "Identify and describe the clothing items in these images in detail, including fabric, color, and specific design elements for technical replication.";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          ...imageParts,
          { text: prompt }
        ]
      }
    });
    return response.text || "";
  } catch (err) {
    throw handleGeminiError(err);
  }
};

/**
 * [FIX]: Detailed deep scan of fashion elements
 */
export const analyzeDeepScan = async (image: string, mimeType: string = 'image/png', type: DeepScanType = 'PRODUCT'): Promise<DeepScanResult> => {
  await ensureApiKey();
  const ai = getClient();
  
  let specificPrompt = "";
  switch(type) {
    case 'PRODUCT': specificPrompt = "Focus on the product's texture, fabric, patterns, and construction details."; break;
    case 'MODEL': specificPrompt = "Focus on the model's physical traits, ethnicity, age, and overall look."; break;
    case 'POSE': specificPrompt = "Focus on the model's pose, body angle, and limb positions."; break;
    case 'BACKGROUND': specificPrompt = "Focus on the environment, location, and background elements."; break;
    case 'LIGHTING': specificPrompt = "Focus on the lighting style, color temperature, and overall mood."; break;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          fileToPart(image, mimeType),
          { text: `Perform a deep scan of the fashion elements in this image. ${specificPrompt} Provide a detailed analysis in English and a concise summary in Korean.` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            english: { type: Type.STRING, description: "Detailed analysis in English" },
            korean: { type: Type.STRING, description: "Concise summary in Korean" }
          },
          required: ["english", "korean"]
        }
      }
    });
    const text = response.text || "";
    try {
        // Remove markdown code blocks if present
        const cleanJson = text.replace(/```json\n?|```/g, "").trim();
        return JSON.parse(cleanJson || '{"english":"", "korean":""}');
    } catch (e) {
        console.error("Failed to parse Deep Scan JSON", e, text);
        return { english: text, korean: "분석 결과를 파싱하는 데 실패했습니다." };
    }
  } catch (err) {
    throw handleGeminiError(err);
  }
};

/**
 * [FIX]: Analyze color palette and lighting tones
 */
export const analyzeColorTone = async (image: string): Promise<string> => {
  await ensureApiKey();
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          fileToPart(image),
          { text: "Analyze the color palette and lighting tones of this image. Describe the dominant colors and the mood they create for artistic replication." }
        ]
      }
    });
    return response.text || "";
  } catch (err) {
    throw handleGeminiError(err);
  }
};
