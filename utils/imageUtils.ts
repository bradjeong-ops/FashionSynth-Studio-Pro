
/**
 * 이미지를 지정된 최대 크기에 맞춰 비율을 유지하며 리사이징하고 
 * 헤더가 제거된 순수 Base64 문자열을 반환합니다.
 */
export const resizeImageFile = async (
  file: File,
  maxDimension: number = 2048,
  quality: number = 0.9
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // 이미지가 이미 설정값보다 작다면 리사이징 없이 압축만 진행
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = (height * maxDimension) / width;
          width = maxDimension;
        } else {
          width = (width * maxDimension) / height;
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context failure'));
        return;
      }

      // 이미지 선명도 유지를 위한 설정
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(img, 0, 0, width, height);

      // 용량을 줄이면서도 디테일은 살리는 JPEG 90% 품질
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
      
      resolve(base64);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image load error'));
    };

    img.src = objectUrl;
  });
};
