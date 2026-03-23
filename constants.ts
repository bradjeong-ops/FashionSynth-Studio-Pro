
export const DEFAULT_FEMALE_HEIGHT = 178;
export const DEFAULT_MALE_HEIGHT = 188;
export const DEFAULT_HEIGHT = DEFAULT_FEMALE_HEIGHT;
export const MIN_HEIGHT = 150;
export const MAX_HEIGHT = 200;
export const MAX_QUANTITY = 4;

// 강력한 부정 프롬프트: 패션 모델의 비율을 망치는 모든 요소 차단
export const COMMON_NEGATIVE_PROMPT = "(culottes:9.0), (long pants:9.8), (dress trousers:9.8), (jeans:9.5), (formal slacks:9.5), (cut-off formal pants:9.8), (short legs:9.9), (average legs:9.5), (long chin:9.9), (long jawline:9.9), (long face:9.8), (horse face:9.5), (high heels:7.5), (boots:6.5), (cropped feet:9.9), (cut-off legs:9.9), (out of frame feet:9.9), (cropped shoes:9.9), (cut-off shoes:9.9), (cropped head:9.9), (cut-off head:9.9), (out of frame head:9.9), (giant head:9.8), (normal head size:9.9), (average proportions:9.9), (bulky upper body:9.5), (over-muscular:9.0), (wide torso:9.0), (narrow shoulders:9.8), (sloping shoulders:9.8), (long torso:9.8), (low waist:9.9), (untucked shirt:9.8), (bad anatomy:4.0), (distorted limbs:3.5), (sanpaku eyes:9.9), (visible white below iris:9.9), (visible white above iris:9.9), (upturned eyes:9.0), logos, text on shirt, lowres, blurry, noise, messy clothes, desaturated, low contrast, hazy, out of focus, flat colors";

export const MALE_NEGATIVE_PROMPT = `(skirt:9.9), (dress:9.9), (gown:9.9), female, feminine, woman, girl, ${COMMON_NEGATIVE_PROMPT}`;
export const FEMALE_NEGATIVE_PROMPT = `male, masculine, man, boy, beard, mustache, ${COMMON_NEGATIVE_PROMPT}`;

// [의상 착용 전용] 아이덴티티 및 정밀 튜닝된 인체 비율 잠금
export const IDENTITY_LOCK_INSTRUCTION = `
# [CRITICAL: MASTER PHYSIQUE & OUTFIT REPLICATION - V9.5]
- IMAGE 1 is the MASTER REFERENCE for Identity and Physique.
- [ANATOMY LOCK]: Maintain current 어깨 라인 (Shoulder Line).
- [HEAD SIZE ADJUSTMENT]: Extreme reduction. The width of the shoulders MUST equal exactly 3.5 times the width of the head.
- [UPPER BODY BALANCE]: Avoid any bulkiness or excessive muscularity. Keep the upper body sleek and lean.
- [FACIAL STRUCTURE]: Shortest compact chin and jawline. No elongation.
- [LEG LENGTH]: (ULTRA-IMPORTANT) Maximally elongated legs. Achieve an 1:15 to 1:18 height ratio (Supreme Super-Heroic Fashion Illustration Aesthetic). 
- [WAISTLINE]: Raise the waistband 3cm higher than standard (Extreme-high waist).
- [OUTFIT REPLICATION]:
  1. TOP: Minimalist slim-fit t-shirt, DEEPLY and NEATLY TUCKED into bottom.
  2. BOTTOM: Casual Cotton Twill Shorts or Mini Skirt as per reference.
  3. FOOTWEAR: Minimalist White Leather Sneakers (Fully visible).
`;

// [모델 생성 전용] 참조 이미지의 완벽한 밸런스를 표준으로 설정
export const DEFAULT_FEMALE_OUTFIT = "[STYLE LOCK: FEMALE-SUPREME] Top: Pale Yellow slim-fit t-shirt (DEEPLY TUCKED IN). Bottom: Pale Beige High-waisted Mini Skirt. Footwear: White Leather Sneakers. (Idealized 1:13 ratio).";
export const DEFAULT_MALE_OUTFIT = "[STYLE LOCK: MASCULINE-ULTRA-HEROIC] Top: Pale Yellow clean slim-fit crewneck t-shirt (ABSOLUTELY DEEPLY TUCKED). Bottom: Pale Beige Casual Cotton Twill Shorts (High-cropped). Footwear: Minimalist White Leather Sneakers. (CRITICAL: Extra-Broad Square Shoulders, Shoulder-to-Head width ratio is 3.5:1, Sleek non-bulky frame, Super-Micro Head, Ultra-long legs, 3cm Higher Waist).";

export const BODY_RATIO_PROMPT = `
[FRAME & VIEW CONSTRAINTS]
- [VIEW: FULL_BODY]: (MANDATORY) Show entire body from head to shoes. WHITE LEATHER SNEAKERS MUST BE FULLY VISIBLE.
- [COMPOSITION]: (CRITICAL) Leave 10% empty space at the bottom of the frame below the shoes AND 10% empty space at the top of the frame above the head. DO NOT crop the head, feet, or shoes.
- [CAMERA]: Low-angle shot to emphasize the extreme elongated-leg effect.

[ANATOMICAL SPECIFICATIONS - SUPREME FASHION V9.5]
- [SHOULDERS]: Maintain the current perfectly horizontal 'Square Shoulders (직각 어깨)'.
- [HEAD]: (ULTRA-CRITICAL) Reduce head size significantly. The width of the shoulders must be exactly 3.5 times the width of the head.
- [BALANCE]: Ensure the upper body is lean and fashion-forward. NO bulky muscles.
- [FACE]: Super compact facial structure. Shorten the chin and jaw.
- [LEGS]: (ULTRA-IMPORTANT) Elongate the legs to the maximum limit of stylized fashion illustration. 
- [WAIST]: Extreme high waist placement (3cm higher than navel).
- [TUCK-IN]: (ABSOLUTE) All tops MUST be perfectly and deeply tucked in, revealing the full structural high waistband.
`;

export const OUTFIT_NEGATIVE_PROMPT = "skirt(on male), dress, gown, long pants, formal slacks, dress trousers, long chin, long jaw, short legs, cut-off formal pants, large head, bulky torso, heavy muscles, narrow shoulders, untucked shirt, distorted proportions";
export const HIGH_QUALITY_PROMPT = "Masterpiece, best quality, 8k resolution, ultra-sharp focus, crisp details, high fidelity, natural colors, balanced saturation, accurate color reproduction, hyper-realistic skin texture, centered iris, natural eye positioning, professional fashion studio lighting, pure white background.";

export const LIGHTING_INTEGRATION_INSTRUCTION = "# STUDIO OPTICS: High-key studio lighting, sharp textile details, crisp shadows on the floor.";
export const STRICT_INVENTORY_INSTRUCTION = "# INVENTORY CONTROL: Render ONLY requested items.";
export const SNEAKER_DEFINITIONS = "[Sneaker Anatomy] Minimalist White Leather, Low-top, Clean professional white sole. Essential for completion.";
