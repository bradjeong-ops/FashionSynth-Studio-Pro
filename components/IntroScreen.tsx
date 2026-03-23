import React, { useEffect, useState } from 'react';
import { Sparkles, Shirt, Wand2 } from 'lucide-react';

// [추가] 그라데이션 흐름 애니메이션 정의 스타일
// 컴포넌트 내부에 <style> 태그로 주입하여 별도 CSS 파일 없이 동작하게 합니다.
const gradientAnimationStyles = `
  @keyframes gradient-flow {
    0% {
      background-position: 0% 50%;
    }
    100% {
      /* 배경을 가로로 2배 늘려놓고, 왼쪽으로 이동시켜 흐르는 효과를 냄 */
      background-position: -200% 50%;
    }
  }
`;

interface IntroScreenProps {
  onComplete: () => void;
}

const IntroScreen: React.FC<IntroScreenProps> = ({ onComplete }) => {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [showCreator, setShowCreator] = useState(false); 

  useEffect(() => {
    // 0.1초 뒤에 바로 제작자 정보 표시
    const timer0 = setTimeout(() => {
        setShowCreator(true);
    }, 100);

    // 2.5초 후 전체 페이드 아웃 시작
    const timer1 = setTimeout(() => {
      setIsFadingOut(true);
    }, 2500);

    // 3초 후 인트로 종료
    const timer2 = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => {
      clearTimeout(timer0);
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [onComplete]);

  return (
    <div 
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0f172a] text-white transition-opacity duration-700 ease-in-out ${
        isFadingOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* [추가] 애니메이션 키프레임 스타일 주입 */}
      <style>{gradientAnimationStyles}</style>

      <div className="relative flex flex-col items-center animate-in zoom-in-95 duration-1000 p-8">
        
        {/* 아이콘 애니메이션 그룹 */}
        <div className="flex items-center gap-4 mb-8">
           <div className="p-4 bg-blue-600/20 rounded-full border border-blue-500/30 shadow-[0_0_30px_rgba(37,99,235,0.3)] animate-bounce duration-[2000ms]">
              <Shirt size={48} className="text-blue-400" />
           </div>
           <div className="absolute -right-6 -top-4 animate-pulse">
              <Sparkles size={28} className="text-yellow-400" />
           </div>
           <div className="absolute -left-6 bottom-0 animate-pulse delay-300">
              <Wand2 size={28} className="text-purple-400" />
           </div>
        </div>

        {/* 타이틀 [수정됨] 
           - 기존의 bg-gradient 관련 클래스를 제거하고 인라인 스타일로 대체했습니다.
        */}
        <h1 
          className="text-4xl md:text-6xl font-black tracking-tighter drop-shadow-2xl mb-6 text-center leading-relaxed pb-2 px-2 text-transparent bg-clip-text"
          style={{
            // 1. 더 풍부하고 반복되는 그라데이션 정의 (파랑 -> 보라 -> 에메랄드 -> 다시 파랑)
            backgroundImage: 'linear-gradient(to right, #60a5fa, #a855f7, #10b981, #60a5fa)',
            // 2. 배경 크기를 가로로 200% 늘림
            backgroundSize: '200% auto',
            // 3. 위에서 정의한 키프레임 애니메이션 적용 (2초 동안 무한 반복, 선형 이동)
            animation: 'gradient-flow 2s linear infinite'
          }}
        >
          FashionSynth Studio
        </h1>

        {/* 제작자 정보 */}
        <div 
            className={`flex flex-col items-center gap-2 transition-all duration-1000 transform ${
                showCreator ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
        >
          <div className="h-px w-24 bg-slate-700 mb-2"></div>
          <p className="text-sm md:text-base text-slate-400 tracking-widest uppercase font-medium">
            Virtual Studio
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono">
            Directed by <span className="text-slate-300 font-bold">D.K</span>
          </p>
        </div>

        {/* 로딩 바 애니메이션 */}
        <div className="mt-16 w-56 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 w-full origin-left animate-[grow_2.5s_ease-in-out_forwards]" style={{ width: '100%' }}></div>
        </div>
      </div>
      
      {/* 배경 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-[#0f172a] to-[#0f172a] pointer-events-none"></div>
    </div>
  );
};

export default IntroScreen;