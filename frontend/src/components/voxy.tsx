import React, { useState, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

// --- Typisierung für das Modul ---
export type MascotState = 'waving' | 'typing' | 'locking' | 'friends' | 'happy' | 'support';
export type MascotTrigger = 'always' | 'hover' | 'click';

interface MascotProps {
    state: MascotState;
    trigger?: MascotTrigger;
    message?: string;
    className?: string;
    // Tutorial props
    isTutorial?: boolean;
    onNext?: () => void;
    onBack?: () => void;
    onEnd?: () => void;
    currentStep?: number;
    totalSteps?: number;
}

// --- Das Haupt-Maskottchen-Modul ---
export const Mascot: React.FC<MascotProps> = ({
    state,
    trigger = 'always',
    message,
    className = '',
    isTutorial,
    onNext,
    onBack,
    onEnd,
    currentStep = 0,
    totalSteps = 0
}) => {
    const [isClicked, setIsClicked] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const mascotRef = useRef<HTMLDivElement>(null);
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
    const [bubbleRect, setBubbleRect] = useState<{ top: number; left: number; width: number; viewportTop: number } | null>(null);
    const uId = useId().replace(/:/g, ''); // Remove colons to make it safer for CSS selectors

    // Bestimmt, ob die SVG-Pfade animiert werden sollen
    const isAnimating = !!(
        trigger === 'always' ||
        (trigger === 'hover' && isHovered) ||
        (trigger === 'click' && isClicked) ||
        isTutorial
    );

    // Tooltip Text basierend auf dem Zustand
    const getTooltipText = () => {
        switch (state) {
            case 'typing':
                return 'Start chatting!';
            case 'waving':
                return 'Welcome to the secure chat!';
            case 'locking':
                return 'Connection to secure chat is built.';
            case 'friends':
                return 'Connect with friends!';
            case 'happy':
                return 'You have mail!';
            case 'support':
                return 'How can I help you?';
            default:
                return '';
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => setPortalContainer(document.body), 0);
        return () => clearTimeout(timer);
    }, []);

    const updateBubblePosition = () => {
        if (mascotRef.current) {
            const rect = mascotRef.current.getBoundingClientRect();
            setBubbleRect({
                top: rect.top, // Use viewport-relative top for fixed positioning
                left: rect.left, // Use viewport-relative left for fixed positioning
                width: rect.width,
                viewportTop: rect.top
            });
        }
    };

    useEffect(() => {
        if (isHovered || trigger === 'always' || (trigger === 'click' && isClicked) || isTutorial) {
            updateBubblePosition();
            window.addEventListener('scroll', updateBubblePosition, true);
            window.addEventListener('resize', updateBubblePosition);
            return () => {
                window.removeEventListener('scroll', updateBubblePosition, true);
                window.removeEventListener('resize', updateBubblePosition);
            };
        }
    }, [isHovered, trigger, isClicked, isTutorial]);

    // Reset interaction state when tutorial ends to prevent stuck bubbles
    useEffect(() => {
        if (!isTutorial && portalContainer) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsClicked(false);
        }
    }, [isTutorial, portalContainer]);

    const showBubble = isHovered || (trigger === 'click' && isClicked) || isTutorial;

    // Check if we should flip the bubble to be below the mascot
    // If mascot is closer than 180px to the top of viewport, show bubble below (ONLY in tutorial mode)
    const shouldShowBelow = isTutorial && bubbleRect && bubbleRect.viewportTop < 180;

    // Calculate horizontal offset to keep bubble on screen
    const bubbleWidth = 280; // max-width
    let horizontalOffset = 0;
    if (bubbleRect && typeof window !== 'undefined') {
        const centerX = bubbleRect.left + (bubbleRect.width / 2);
        const potentialLeft = centerX - (bubbleWidth / 2);
        const potentialRight = centerX + (bubbleWidth / 2);
        const screenPadding = 16;

        if (potentialLeft < screenPadding) {
            horizontalOffset = screenPadding - potentialLeft;
        } else if (potentialRight > window.innerWidth - screenPadding) {
            horizontalOffset = (window.innerWidth - screenPadding) - potentialRight;
        }
    }

    const bubbleContent = (
        <AnimatePresence>
            {showBubble && bubbleRect && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: shouldShowBelow ? -10 : 10, x: '-50%' }}
                    animate={{
                        opacity: 1,
                        scale: 1,
                        y: 0,
                        x: `calc(-50% + ${horizontalOffset}px)`,
                        transition: { type: 'spring', damping: 20, stiffness: 300 }
                    }}
                    exit={{
                        opacity: 0,
                        scale: 0.9,
                        y: shouldShowBelow ? -5 : 5,
                        transition: { duration: 0.2 }
                    }}
                    className={`fixed w-max max-w-[280px] bg-[#313338] text-white shadow-[0_8px_25px_rgba(0,0,0,0.25)] border border-zinc-700/50 z-[10001] flex flex-col items-center gap-3 ${isTutorial ? 'p-4 rounded-[24px]' : 'py-2.5 px-4 rounded-3xl rounded-br-sm pointer-events-none'} ${shouldShowBelow ? 'mt-3 mb-0' : 'mb-3 mt-0'}`}
                    style={{
                        top: shouldShowBelow ? `${bubbleRect.top + 120}px` : `${bubbleRect.top - 70}px`,
                        left: `${bubbleRect.left + bubbleRect.width / 2}px`,
                        transformOrigin: shouldShowBelow ? 'top center' : 'bottom center'
                    }}
                >
                    <span className={`leading-snug text-center w-full ${isTutorial ? 'text-[15px] font-medium' : 'text-[16px] font-medium'}`}>
                        {message || getTooltipText()}
                    </span>

                    {isTutorial && (
                        <div className="flex items-center justify-between w-full mt-1 gap-3">
                            <div className="flex gap-2">
                                {currentStep > 0 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onBack?.(); }}
                                        className="px-3 py-1.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-xs font-bold transition-colors cursor-pointer"
                                    >
                                        Back
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-400 font-bold mr-1">
                                    {currentStep + 1} / {totalSteps}
                                </span>
                                {currentStep < totalSteps - 1 ? (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onNext?.(); }}
                                        className="px-4 py-1.5 rounded-xl bg-primary hover:bg-[#E0484D] text-xs font-bold transition-colors cursor-pointer"
                                    >
                                        Next
                                    </button>
                                ) : (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onEnd?.(); }}
                                        className="px-4 py-1.5 rounded-xl bg-primary hover:bg-[#E0484D] text-xs font-bold transition-colors cursor-pointer"
                                    >
                                        Done
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <div
            ref={mascotRef}
            className={`relative group inline-block ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => setIsClicked(!isClicked)}
        >
            {portalContainer && createPortal(bubbleContent, portalContainer)}

            {/* Maskottchen Container - Drop-Shadow erscheint IMMER bei Hover */}
            <div className={`w-64 h-64 flex items-center justify-center transition-all duration-300 cursor-pointer overflow-visible relative group-hover:scale-105 transition-transform duration-500 ${isTutorial ? 'scale-105' : ''}`}>
                {/* Der Rote Glow-Effekt im Hintergrund - Verkleinert und Unschärfe reduziert um Clipping zu vermeiden */}
                <div className={`absolute inset-8 bg-[#FF5A5F] blur-[30px] rounded-full transition-opacity duration-500 pointer-events-none ${isTutorial ? 'opacity-30' : 'opacity-0 group-hover:opacity-20'}`}></div>
                {state === 'waving' && <WavingMascot isAnimating={isAnimating} id={uId} />}
                {state === 'typing' && <TypingMascot isAnimating={isAnimating} id={uId} />}
                {state === 'locking' && <LockingMascot isAnimating={isAnimating} id={uId} />}
                {state === 'friends' && <FriendsMascot isAnimating={isAnimating} id={uId} />}
                {state === 'happy' && <HappyMascot isAnimating={isAnimating} id={uId} />}
                {state === 'support' && <SupportMascot isAnimating={isAnimating} id={uId} />}
            </div>
        </div>
    );
};

// ==========================================
// 1. Winken (Waving) SVG Komponente
// ==========================================
const WavingMascot = ({ isAnimating, id }: { isAnimating: boolean, id: string }) => (
    <svg viewBox="0 0 386.37 552.55" className="w-full h-full overflow-visible">
        <defs>
            <style>{`
        .w-cls-1-${id} { fill: url(#wave-grad-${id}); }
        .w-cls-2 { fill: #fff; }
        .w-cls-3 { fill: #eb5d63; }
        .w-cls-4 { fill: #1e1e1c; }
        .w-cls-5 { fill: #8f2113; }
        .w-cls-6 { fill: none; stroke: #eb5d63; stroke-miterlimit: 10; stroke-width: 5px; }
        
        @keyframes wave-left {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-25deg); }
        }
        @keyframes wave-right {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(25deg); }
        }
        .anim-wave-left {
          transform-origin: 51px 320px;
          animation: wave-left 0.6s ease-in-out infinite;
        }
        .anim-wave-right {
          transform-origin: 345px 320px;
          animation: wave-right 0.6s ease-in-out infinite;
        }
      `}</style>
            <linearGradient id={`wave-grad-${id}`} x1="197.46" y1="401.16" x2="197.46" y2="40.72" gradientTransform="translate(0 548.87) scale(1 -1)" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" />
                <stop offset="1" stopColor="#eb5d63" />
            </linearGradient>
        </defs>
        <path className={`w-cls-1-${id}`} d="M351.78,327.86c3.93,24.01,14.65,89.42-27.72,136.81-40.66,45.51-102.95,43.91-126.86,43.3-21.42-.56-92.54-2.36-132.93-57.16-33.78-45.87-25.18-100.54-21.65-122.95,5.33-33.81,15.84-58.99,21.7-70.44,7.11-13.86,57.21-107.6,132.85-109.68,81.1-2.23,141.81,102.21,154.55,180.11h.05Z" />
        <ellipse className="w-cls-2" cx="145.59" cy="239.58" rx="52.13" ry="55.18" transform="translate(-103.72 367.8) rotate(-85.93)" />
        <ellipse className="w-cls-2" cx="252.09" cy="241.88" rx="52.13" ry="55.18" transform="translate(-7.07 476.17) rotate(-85.93)" />
        <ellipse className="w-cls-4" cx="248.17" cy="254.5" rx="20.15" ry="30.81" />
        <path className="w-cls-3" d="M149.58,205.19c13.59,2.08,25.84,13.06,32.08,24.31,12.72,22.94,2.97,51.55,12.66,54.92,1.89.66,3.78.1,4.88-.34,1.76,1.49,4.14,3.02,6.18,2.35,7.68-2.53-3.39-31.63,9.07-55.12,6.03-11.37,18.07-22.35,31.7-24.92,25.92-4.9,49.22,21.85,63.96,38.78,36.63,42.06,44.29,92.65,45.79,122.39-.23-127.65-84.19-218.06-154.25-219.76-76.96-1.88-176.64,102.27-160.09,249.05.93-41.09,9.12-106.64,51.37-156.66,11.5-13.61,32.67-38.67,56.63-35Z" />

        <g className={isAnimating ? 'anim-wave-right' : ''}>
            <ellipse className="w-cls-3" cx="345.28" cy="361.34" rx="27.34" ry="44.24" />
        </g>
        <g className={isAnimating ? 'anim-wave-left' : ''}>
            <ellipse className="w-cls-3" cx="51.51" cy="361.34" rx="27.34" ry="44.24" />
        </g>

        <ellipse className="w-cls-2" cx="203.65" cy="423.45" rx="81.58" ry="84.7" />
        <path className="w-cls-5" d="M170.5,285.85c.48,6.7,25.84,7.18,28.48,7.21,9.42.13,30.74-1.07,31.17-7.21.38-5.38-15.2-14.72-30.64-14.44-14.65.28-29.39,9.21-29.01,14.44Z" />
        <ellipse className="w-cls-4" cx="150.34" cy="255.98" rx="20.15" ry="30.81" />
        <ellipse className="w-cls-5" cx="285.2" cy="495.89" rx="40.51" ry="17.49" />
        <ellipse className="w-cls-5" cx="122.07" cy="495.89" rx="40.51" ry="17.49" />
        <path className="w-cls-3" d="M191.79,135.66c15.81-32.26,26.27-44.65,35.59-53.38,2.67-2.51,6.5-5.89,8.55-4.8,2.31,1.24,1.19,7.54.69,10.25-5.13,27.46-30.97,45.64-40.03,52.01-2.56,1.8-5.51,3.6-6.5,2.74-1.14-.96.79-4.92,1.7-6.85v.03Z" />
        <circle className="w-cls-3" cx="239.24" cy="75.12" r="10.81" transform="translate(147.33 308.43) rotate(-85.93)" />
        <path className="w-cls-6" d="M218.94,81.38c-.25-1.52-2.02-13.83,6.67-22.75,6.94-7.14,20.04-11.6,30.03-4.59,9.68,6.79,11.16,20.59,5.74,29.99-5.93,10.29-17.98,11.52-19.23,11.63" />
        <path className="w-cls-6" d="M208.34,85.25c-.35-2.22-2.95-20.3,9.8-33.44,10.19-10.49,29.42-17.04,44.11-6.75,14.22,9.95,16.38,30.25,8.45,44.06-8.71,15.09-26.4,16.93-28.23,17.08" />
        <circle className="w-cls-2" cx="242.66" cy="239.58" r="8.72" />
        <line className="w-cls-6" x1="157.1" y1="412.99" x2="157.1" y2="448.04" />
        <line className="w-cls-6" x1="173.29" y1="407.05" x2="173.29" y2="453.96" />
        <line className="w-cls-6" x1="189.86" y1="397.99" x2="189.86" y2="468" />
        <line className="w-cls-6" x1="206.44" y1="404.36" x2="206.44" y2="451.27" />
        <line className="w-cls-6" x1="222.33" y1="411.65" x2="222.33" y2="446.67" />
        <line className="w-cls-6" x1="238.55" y1="405.71" x2="238.55" y2="452.61" />
        <line className="w-cls-6" x1="255.12" y1="399.18" x2="255.12" y2="459.14" />
        <path className="w-cls-5" d="M112.6,211.65c-1.31-1.43,6.63-16.13,20.82-20.43,16.17-4.93,32.9,5.95,32.42,7.86-.42,1.65-13.39-4.17-30.22.57-14.59,4.11-21.88,13.24-23.02,12.03v-.03Z" />
        <path className="w-cls-5" d="M237.35,201.25c-.35-1.67,14.06-10.25,28.48-6.37,16.36,4.38,24.61,22.67,23.38,23.79-1.06.98-8.74-11.49-25.01-16.36-14.74-4.38-26.52.41-26.85-1.07Z" />
        <circle className="w-cls-2" cx="145.59" cy="239.58" r="8.72" />
    </svg>
);

// ==========================================
// 2. Tippen (Typing) SVG Komponente
// ==========================================
const TypingMascot = ({ isAnimating, id }: { isAnimating: boolean, id: string }) => (
    <svg viewBox="0 0 386.37 569.02" className="w-full h-full overflow-visible">
        <defs>
            <style>{`
        .t-cls-1-${id} { fill: url(#type-grad-${id}); }
        .t-cls-2, .t-cls-3 { fill: #fff; }
        .t-cls-2, .t-cls-4 { stroke: #eb5d63; stroke-miterlimit: 10; stroke-width: 5px; }
        .t-cls-5 { fill: #eb5d63; }
        .t-cls-6 { fill: #1e1e1c; }
        .t-cls-7 { fill: #8f2113; }
        .t-cls-4 { fill: none; }
        
        @keyframes type-anim {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(15px); }
        }
        .anim-type-left {
          animation: type-anim 0.3s ease-in-out infinite;
        }
        .anim-type-right {
          animation: type-anim 0.3s ease-in-out infinite 0.15s;
        }
      `}</style>
            <linearGradient id={`type-grad-${id}`} x1="186.5" y1="408.35" x2="186.5" y2="157.15" gradientTransform="translate(0 581.81) scale(1 -1)" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" />
                <stop offset="1" stopColor="#eb5d63" />
            </linearGradient>
        </defs>
        <path className={`t-cls-1-${id}`} d="M341.64,353.62c.59,23.68,1.19,47.36,1.78,71.04-103.99-.68-207.99-1.37-311.98-2.05-2.07-16.91-3.28-40.87,1.04-68.99.85-5.56,6.22-39.08,21.7-70.44,18.31-37.07,68.8-107.59,132.85-109.68,66.97-2.18,142.63,70.66,154.6,180.11Z" />
        <ellipse className="t-cls-3" cx="134.42" cy="269" rx="55.18" ry="52.13" />
        <ellipse className="t-cls-3" cx="240.81" cy="268.74" rx="55.18" ry="52.13" />
        <path className="t-cls-5" d="M139.45,230.95c13.35,2.47,25.67,12.51,32.08,24.31,13.06,24.01.5,53.1,9.5,56.71,2.57,1.03,5.66-.5,8.04-2.13,1.82,1.12,4.74,2.56,7.19,1.53,8.6-3.61-3.51-31.4,8.06-54.31,6.08-12.03,18.55-22.44,31.7-24.92,28.24-5.34,54.24,26.78,63.96,38.78,43.33,53.5,42.46,117.87,42.53,117.86.1-.02,7.89-106.2-60.54-172.6-10.49-10.18-43.38-42.08-90.46-42.62-60.19-.69-100.66,50.53-115.88,69.79-55.79,70.61-47.33,155.87-44.21,179.26-.18-29.69,2.46-117.07,53.55-165.97,10.95-10.48,31.33-29.98,54.45-25.7Z" />
        <path className="t-cls-3" d="M193.51,364.51c36.22.05,68.23,24.59,77.72,59.68-51.79-.34-103.57-.68-155.36-1.02,9.86-34.66,41.73-58.7,77.64-58.66Z" />
        <path className="t-cls-7" d="M160.36,311.61c.48,6.7,25.84,7.18,28.48,7.21,9.42.13,30.74-1.07,31.17-7.21.38-5.38-15.2-14.72-30.64-14.44-14.65.28-29.39,9.21-29.01,14.44Z" />
        <path className="t-cls-5" d="M181.66,161.43c15.81-32.26,26.27-44.65,35.59-53.38,2.67-2.51,6.5-5.89,8.55-4.8,2.31,1.24,1.19,7.54.69,10.25-5.13,27.46-30.97,45.64-40.03,52.01-2.56,1.8-5.51,3.6-6.5,2.74-1.14-.96.79-4.92,1.7-6.85v.03Z" />
        <circle className="t-cls-5" cx="229.11" cy="100.88" r="10.81" transform="translate(112.22 322.25) rotate(-85.93)" />
        <path className="t-cls-4" d="M208.8,107.14c-.25-1.52-2.02-13.83,6.67-22.75,6.94-7.14,20.04-11.6,30.03-4.59,9.68,6.79,11.16,20.59,5.74,29.99-5.93,10.29-17.98,11.52-19.23,11.63" />
        <path className="t-cls-4" d="M198.21,111.01c-.35-2.22-2.95-20.3,9.8-33.44,10.19-10.49,29.42-17.04,44.11-6.75,14.22,9.95,16.38,30.25,8.45,44.06-8.71,15.09-26.4,16.93-28.23,17.08" />
        <g>
            <ellipse className="t-cls-6" cx="134.72" cy="290.55" rx="20.15" ry="30.81" />
            <circle className="t-cls-3" cx="129.23" cy="277.48" r="9.32" />
        </g>
        <path className="t-cls-7" d="M100.75,239.15c-1.31-1.43,6.63-16.13,20.82-20.43,16.17-4.93,32.9,5.95,32.42,7.86-.42,1.65-13.39-4.17-30.22.57-14.59,4.11-21.88,13.24-23.02,12.03v-.03Z" />
        <path className="t-cls-7" d="M225.58,224.45c-.35-1.67,14.06-10.25,28.48-6.37,16.36,4.38,24.61,22.67,23.38,23.79-1.06.98-8.74-11.49-25.01-16.36-14.74-4.38-26.52.41-26.85-1.07Z" />

        <path className="t-cls-2" d="M43.14,408.65c-19.6,13.49-46.11,41.94-39.65,55,2.49,5.03,9.2,6.45,12.15,7.04,106.98,21.18,303.72,4.91,343.45,5.12,2.75.01,10.87.14,15.35-5.12,9.54-11.21-2.48-41.04-15.99-56.28-25.36-28.59-62.07-12.67-163.09-14.71-88.89-1.8-117.04-15.27-152.22,8.95Z" />
        <path className="t-cls-5" d="M68.9,408.13c-4.1,1.1-6.7,3.58-9.46,6.22-3.52,3.36-5.95,5.46-5.41,7.3.24.81,1.18,1.99,10.54,3.24,8.16,1.09,12.23,1.63,14.87.54,7.25-3.01,11.51-12.76,9.2-15.94-.41-.57-1.04-.89-10.01-1.36-7.9-.41-8.85-.24-9.73,0Z" />
        <path className="t-cls-5" d="M107.92,408.79c-2.49.94-3.98,2.94-6.85,6.91-3.75,5.17-5.62,7.76-4.87,9.73,1.16,3.03,6.95,3.42,12.43,3.78,4.48.3,7.03.47,10.16-.86,5.59-2.37,8.02-7.39,9.03-9.47,1.39-2.86,2.34-4.82,1.51-6.51-.68-1.4-2.19-1.82-12.72-3.23-6.31-.85-7.27-.9-8.7-.36Z" />
        <path className="t-cls-5" d="M142.3,411.83c-4.52,2.46-7.08,9.53-5.77,13.35,2.71,7.87,22.67,4.52,60.09,5.77,37.26,1.24,57.24,5.88,62.82-3.95,1.32-2.33,3.05-7.62.78-11.02-2.35-3.52-8-3.56-10.49-3.54-26.41.16-40.77,2.3-54.93,1.52-27-1.48-40.49-2.23-46.43-3.03-.81-.11-3.5-.49-6.07.91Z" />
        <path className="t-cls-5" d="M91.12,444.31c-2.49.94-3.98,2.94-6.85,6.91-3.75,5.17-5.62,7.76-4.87,9.73,1.16,3.03,6.95,3.42,12.43,3.78,4.48.3,7.03.47,10.16-.86,5.59-2.37,8.02-7.39,9.03-9.47,1.39-2.86,2.34-4.82,1.51-6.51-.68-1.4-2.19-1.82-12.72-3.23-6.31-.85-7.27-.9-8.7-.36Z" />
        <path className="t-cls-5" d="M44.67,438.32c-2.49.94-3.98,2.94-6.85,6.91-3.75,5.17-5.62,7.76-4.87,9.73,1.16,3.03,6.95,3.42,12.43,3.78,4.48.3,7.03.47,10.16-.86,5.59-2.37,8.02-7.39,9.03-9.47,1.39-2.86,2.34-4.82,1.51-6.51-.68-1.4-2.19-1.82-12.72-3.23-6.31-.85-7.27-.9-8.7-.36Z" />
        <path className="t-cls-5" d="M193.87,450.28c-2.41,1.14-3.72,3.26-6.25,7.46-3.3,5.47-4.95,8.21-4.03,10.11,1.41,2.93,7.21,2.82,12.71,2.73,4.49-.08,7.04-.12,10.05-1.71,5.37-2.83,7.37-8.03,8.2-10.19,1.14-2.97,1.93-5,.96-6.61-.8-1.33-2.34-1.63-12.94-2.15-6.36-.31-7.32-.28-8.69.37Z" />
        <path className="t-cls-5" d="M147.08,448.22c-2.41,1.14-3.72,3.26-6.25,7.46-3.3,5.47-4.95,8.21-4.03,10.11,1.41,2.93,7.21,2.82,12.71,2.73,4.49-.08,7.04-.12,10.05-1.71,5.37-2.83,7.37-8.03,8.2-10.19,1.14-2.97,1.93-5,.96-6.61-.8-1.33-2.34-1.63-12.94-2.15-6.36-.31-7.32-.28-8.69.37Z" />
        <path className="t-cls-5" d="M333.52,408.41c4.1,1.1,6.7,3.58,9.46,6.22,3.52,3.36,5.95,5.46,5.41,7.3-.24.81-1.18,1.99-10.54,3.24-8.16,1.09-12.23,1.63-14.87.54-7.25-3.01-11.51-12.76-9.2-15.94.41-.57,1.04-.89,10.01-1.36,7.9-.41,8.85-.24,9.73,0Z" />
        <path className="t-cls-5" d="M294.5,409.07c2.49.94,3.98,2.94,6.85,6.91,3.75,5.17,5.62,7.76,4.87,9.73-1.16,3.03-6.95,3.42-12.43,3.78-4.48.3-7.03.47-10.16-.86-5.59-2.37-8.02-7.39-9.03-9.47-1.39-2.86-2.34-4.82-1.51-6.51.68-1.4,2.19-1.82,12.72-3.23,6.31-.85,7.27-.9,8.7-.36Z" />
        <path className="t-cls-5" d="M302.09,443.93c4.1,1.1,6.7,3.58,9.46,6.22,3.52,3.36,5.95,5.46,5.41,7.3-.24.81-1.18,1.99-10.54,3.24-8.16,1.09-12.23,1.63-14.87.54-7.25-3.01-11.51-12.76-9.2-15.94.41-.57,1.04-.89,10.01-1.36,7.9-.41,8.85-.24,9.73,0Z" />
        <path className="t-cls-5" d="M263.07,444.59c2.49.94,3.98,2.94,6.85,6.91,3.75,5.17,5.62,7.76,4.87,9.73-1.16,3.03-6.95,3.42-12.43,3.78-4.48.3-7.03.47-10.16-.86-5.59-2.37-8.02-7.39-9.03-9.47-1.39-2.86-2.34-4.82-1.51-6.51.68-1.4,2.19-1.82,12.72-3.23,6.31-.85,7.27-.9,8.7-.36Z" />
        <path className="t-cls-5" d="M350.7,437.51c2.49.94,3.98,2.94,6.85,6.91,3.75,5.17,5.62,7.76,4.87,9.73-1.16,3.03-6.95,3.42-12.43,3.78-4.48.3-7.03.47-10.16-.86-5.59-2.37-8.02-7.39-9.03-9.47-1.39-2.86-2.34-4.82-1.51-6.51.68-1.4,2.19-1.82,12.72-3.23,6.31-.85,7.27-.9,8.7-.36Z" />

        <g className={isAnimating ? 'anim-type-right' : ''}>
            <ellipse className="t-cls-5" cx="318.65" cy="367.65" rx="44.24" ry="27.34" transform="translate(-124.28 568.94) rotate(-73.52)" />
        </g>
        <g className={isAnimating ? 'anim-type-left' : ''}>
            <ellipse className="t-cls-5" cx="56.72" cy="364.51" rx="27.34" ry="44.24" transform="translate(-128.21 45.32) rotate(-21.24)" />
        </g>

        <g>
            <ellipse className="t-cls-6" cx="244.13" cy="291.1" rx="20.15" ry="30.81" />
            <circle className="t-cls-3" cx="238.59" cy="278.5" r="9.32" />
        </g>
    </svg>
);

// ==========================================
// 3. Schloss (Locking) SVG Komponente
// ==========================================
const LockingMascot = ({ isAnimating, id }: { isAnimating: boolean, id: string }) => (
    /* OVERFLOW-VISIBLE HINZUGEFÜGT -> Verhindert das Abschneiden am Rand! */
    <svg viewBox="0 0 386.37 552.55" className="w-[70%] h-[70%] overflow-visible">
        <defs>
            <style>{`
        .l-cls-1-${id} { fill: url(#lock-grad-${id}); }
        .l-cls-2 { fill: #fff; }
        .l-cls-3 { fill: #eb5d63; }
        .l-cls-4 { fill: #1e1e1c; }
        .l-cls-5 { fill: #8f2113; }
        .l-cls-6 { fill: none; stroke: #eb5d63; stroke-miterlimit: 10; stroke-width: 5px; }
        
        @keyframes lock-anim {
          0%, 20%, 100% { transform: translateY(0) rotate(0deg); }
          40%, 80% { transform: translateY(-8px) rotate(12deg); }
        }
        .anim-lock-shackle {
          /* Rotations-Mittelpunkt auf die RECHTE Seite gesetzt */
          transform-origin: 363px 185px; 
          animation: lock-anim 2.5s ease-in-out infinite;
        }
      `}</style>
            <linearGradient id={`lock-grad-${id}`} x1="198.88" y1="361.99" x2="198.88" y2="1.55" gradientTransform="translate(0 548.87) scale(1 -1)" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" />
                <stop offset="1" stopColor="#eb5d63" />
            </linearGradient>
        </defs>
        <path className="l-cls-3" d="M187.91,191.31c8.38-35.69,15.96-50.39,23.24-61.2,2.08-3.11,5.12-7.34,7.42-6.72,2.58.71,2.9,7.23,3.02,10.04,1.16,28.48-20.41,52.44-27.97,60.85-2.14,2.38-4.66,4.84-5.84,4.21-1.36-.7-.34-5.08.13-7.2v.03Z" />
        <circle className="l-cls-3" cx="221.32" cy="120.28" r="11.03" transform="translate(-15.84 35.39) rotate(-8.83)" />
        <path className="l-cls-6" d="M202.55,131.13c-.89-1.24-8.32-11.87-4.38-22.74,4.57-12.6,21.8-18.34,34.66-12.82,10.69,4.59,19.32,17.4,15.45,29.84-2.76,8.87-11.21,15.47-21.49,16.75" />
        <rect className="l-cls-3" x="13.28" y="175.55" width="373.09" height="373.09" rx="12" ry="12" />
        <path className={`l-cls-1-${id}`} d="M353.21,367.03c3.93,24.01,14.65,89.42-27.72,136.81-40.66,45.51-102.95,43.91-126.86,43.3-21.42-.56-92.54-2.36-132.93-57.16-33.78-45.87-25.18-100.54-21.65-122.95,5.33-33.81,15.84-58.99,21.7-70.44,7.11-13.86,57.21-107.6,132.85-109.68,81.1-2.23,141.81,102.21,154.55,180.11h.05Z" />
        <ellipse className="l-cls-2" cx="147.02" cy="278.75" rx="52.13" ry="55.18" transform="translate(-141.47 405.62) rotate(-85.93)" />
        <ellipse className="l-cls-2" cx="253.52" cy="281.05" rx="52.13" ry="55.18" transform="translate(-44.82 513.98) rotate(-85.93)" />
        <path className="l-cls-3" d="M150.31,241.56c13.78,2.11,26.22,13.25,32.55,24.66,12.91,23.27,3.02,52.3,12.84,55.72,1.92.67,3.84.1,4.95-.34,1.78,1.51,4.2,3.07,6.27,2.38,7.79-2.57-3.44-32.1,9.2-55.93,6.12-11.53,18.33-22.67,32.16-25.29,26.29-4.97,49.93,22.17,64.9,39.35,37.16,42.67,44.94,94,46.46,124.18-.23-129.51-85.42-221.24-156.5-222.96-78.08-1.91-179.21,103.76-162.42,252.68.95-41.69,9.26-108.2,52.12-158.94,11.67-13.81,33.14-39.24,57.45-35.51Z" />
        <ellipse className="l-cls-3" cx="346.71" cy="400.51" rx="27.34" ry="44.24" />
        <ellipse className="l-cls-3" cx="52.93" cy="400.51" rx="27.34" ry="44.24" />
        <path className="l-cls-2" d="M203.04,375.82c4.81,4.63,19.09,17.17,41.61,20.39,25.39,3.63,44.43-6.99,49.8-10.23,2.32,14.95,4.66,44.08-7.8,76.65-21.43,56.05-70.35,79.63-81.58,84.7-12.52-5.95-59.06-29.88-81.58-84.7-13.97-34.02-12.43-64.68-10.49-80.34,4.9,3.35,22.29,14.38,46.63,12.47,23.73-1.86,38.96-14.85,43.4-18.93Z" />
        <path className="l-cls-5" d="M171.93,325.02c.48,6.7,25.84,7.18,28.48,7.21,9.42.13,30.74-1.07,31.17-7.21.38-5.38-15.2-14.72-30.64-14.44-14.65.28-29.39,9.21-29.01,14.44Z" />
        <ellipse className="l-cls-5" cx="286.63" cy="535.06" rx="40.51" ry="17.49" />
        <ellipse className="l-cls-5" cx="123.5" cy="535.06" rx="40.51" ry="17.49" />
        <g>
            <ellipse className="l-cls-4" cx="243.95" cy="278.75" rx="20.15" ry="30.81" />
            <circle className="l-cls-2" cx="238.3" cy="266.13" r="11.31" />
        </g>
        <path className="l-cls-5" d="M107.49,244.31c-1.31-1.43,6.63-16.13,20.82-20.43,16.17-4.93,32.9,5.95,32.42,7.86-.42,1.65-13.39-4.17-30.22.57-14.59,4.11-21.88,13.24-23.02,12.03v-.03Z" />
        <path className="l-cls-5" d="M240.4,232.99c-.35-1.67,14.06-10.25,28.48-6.37,16.36,4.38,24.61,22.67,23.38,23.79-1.06.98-8.74-11.49-25.01-16.36-14.74-4.38-26.52.41-26.85-1.07Z" />
        <g>
            <ellipse className="l-cls-4" cx="134.04" cy="278.75" rx="20.15" ry="30.81" />
            <circle className="l-cls-2" cx="128.39" cy="266.13" r="11.31" />
        </g>

        {/* Animierter Schloss-Bügel (Shackle) */}
        <g className={isAnimating ? 'anim-lock-shackle' : ''}>
            <path className="l-cls-6" d="M22.96,185.25c-1.06-1.2-2.4-3.62-1.64-9.01C35.85,72.95,101.12,30.78,101.12,30.78,144.31,2.89,187.68,2.45,203.28,2.5c16.23.06,66.24.23,109.65,33.87,69.66,53.98,74.56,157.09,61.35,163.47-3.65,1.76-8.85-3.77-24.15-3.56-10.83.14-13.17,2.98-17.42,2.37-18-2.59-10.08-58.62-36.61-98.21-19.32-28.83-55.36-46.65-89.47-47.2-33.51-.54-70.57,15.04-90.72,43.26-23.05,32.28-29.52,88.75-42.34,89.14-.68.02-2.93-.07-7.72-.03-6.37.05-11.34.28-15.28.48-21.12,1.09-25,2.1-27.6-.85Z" />
        </g>

        {/* Statische Antennenlinie */}
        <path className="l-cls-6" d="M193.49,136c-1.31-1.82-12.25-17.48-6.45-33.49,6.72-18.56,32.11-27.02,51.05-18.89,15.75,6.77,28.45,25.62,22.76,43.96-4.06,13.07-16.51,22.78-31.65,24.67" />

        <path className="l-cls-6" d="M205.55,400.51c3.73,3.59,14.82,13.32,32.29,15.82,19.71,2.82,34.48-5.42,38.64-7.94,1.8,11.6,3.62,34.2-6.05,59.48-16.63,43.49-54.59,61.79-63.31,65.73-9.71-4.61-45.83-23.18-63.31-65.73-10.84-26.4-9.64-50.19-8.14-62.35,3.8,2.6,17.3,11.16,36.18,9.67,18.42-1.45,30.23-11.52,33.68-14.69Z" />
    </svg>
);

// ==========================================
// 4. Freunde (Friends) SVG Komponente
// ==========================================
const FriendsMascot = ({ isAnimating, id }: { isAnimating: boolean, id: string }) => (
    <svg viewBox="0 0 491.3 552.55" className="w-full h-full overflow-visible">
        <defs>
            <style>{`
        .f-cls-1-${id} { fill: url(#friend-grad-1-${id}); }
        .f-cls-2 { fill: #fff; }
        .f-cls-3 { fill: #eb5d63; }
        .f-cls-4 { fill: #1e1e1c; }
        .f-cls-5-${id} { fill: url(#friend-grad-2-${id}); }
        .f-cls-6 { fill: #f39556; }
        .f-cls-7 { fill: #8f2113; }
        .f-cls-8 { fill: none; stroke: #eb5d63; stroke-miterlimit: 10; stroke-width: 5px; }

        /* Animation für das WiFi / Radar Signal an der Antenne */
        @keyframes signal-fade {
          0%, 100% { opacity: 0; transform: scale(0.98); }
          50% { opacity: 1; transform: scale(1.02); }
        }
        .anim-signal-1 { transform-origin: top center; transform-box: fill-box; animation: signal-fade 1.5s infinite ease-in-out; }
        .anim-signal-2 { transform-origin: top center; transform-box: fill-box; animation: signal-fade 1.5s infinite ease-in-out 0.25s; }
        .anim-signal-3 { transform-origin: top center; transform-box: fill-box; animation: signal-fade 1.5s infinite ease-in-out 0.5s; }

        /* Animation für das Winken der Hände beider Figuren */
        @keyframes f-wave-left {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-25deg); }
        }
        @keyframes f-wave-right {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(25deg); }
        }
        /* transform-box: fill-box und center bottom setzt den Rotationsursprung zuverlässig unten ans Gelenk */
        .anim-f-wave-left {
          transform-origin: center bottom;
          transform-box: fill-box;
          animation: f-wave-left 0.6s ease-in-out infinite;
        }
        .anim-f-wave-right {
          transform-origin: center bottom;
          transform-box: fill-box;
          animation: f-wave-right 0.6s ease-in-out infinite;
        }
      `}</style>
            <linearGradient id={`friend-grad-1-${id}`} x1="195.96" y1="399.61" x2="195.96" y2="39.17" gradientTransform="translate(0 548.87) scale(1 -1)" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" />
                <stop offset="1" stopColor="#eb5d63" />
            </linearGradient>
            <linearGradient id={`friend-grad-2-${id}`} x1="417.55" y1="338.87" x2="366.06" y2="506.02" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" />
                <stop offset="1" stopColor="#f49518" />
            </linearGradient>
        </defs>

        {/* Körper Main Red */}
        <path className={`f-cls-1-${id}`} d="M350.29,329.41c3.93,24.01,14.65,89.42-27.72,136.81-40.66,45.51-102.95,43.91-126.86,43.3-21.42-.56-92.54-2.36-132.93-57.16-33.78-45.87-25.18-100.54-21.65-122.95,5.33-33.81,15.84-58.99,21.7-70.44,7.11-13.86,57.21-107.6,132.85-109.68,81.1-2.23,141.81,102.21,154.55,180.11h.05Z" />
        <path className="f-cls-2" d="M199.14,245.05c-1.17,16.4-10.63,35.48-25.22,40.19-6.34,2.04-8.02-.4-28.02-1.72-23.89-1.58-26.36,1.58-33.82-1.56-14.8-6.24-24.5-26.88-23.03-44.74,2.16-26.36,28.94-50.21,58.74-48.08,30.4,2.16,53.39,27.2,51.34,55.92Z" />
        <path className="f-cls-2" d="M305.64,247.35c-1.2,16.84-11.36,36.11-26.26,40.79-7.69,2.42-10.32-.99-32.7-1.27-18.74-.24-20.14,2.12-26.22.02-15.52-5.35-26.45-27.71-24.9-47.37,2.12-27.06,29.2-50.19,58.74-48.08,30.4,2.16,53.39,27.2,51.34,55.92Z" />
        <path className="f-cls-3" d="M148.09,206.74c13.59,2.08,25.84,13.06,32.08,24.31,12.72,22.94,2.97,51.55,12.66,54.92,1.89.66,3.78.1,4.88-.34,1.76,1.49,4.14,3.02,6.18,2.35,7.68-2.53-3.39-31.63,9.07-55.12,6.03-11.37,18.07-22.35,31.7-24.92,25.92-4.9,49.22,21.85,63.96,38.78,36.63,42.06,44.29,92.65,45.79,122.39-.23-127.65-84.19-218.06-154.25-219.76-76.96-1.88-176.64,102.27-160.09,249.05.93-41.09,9.12-106.64,51.37-156.66,11.5-13.61,32.67-38.67,56.63-35Z" />

        {/* Main Red Mascot: Rechte und linke Hand (Winkend animiert) */}
        <g className={isAnimating ? 'anim-f-wave-right' : ''}>
            <ellipse className="f-cls-3" cx="354.43" cy="269.86" rx="44.24" ry="27.34" transform="translate(-41.11 474.78) rotate(-64.67)" />
        </g>
        <g className={isAnimating ? 'anim-f-wave-left' : ''}>
            <ellipse className="f-cls-3" cx="46.78" cy="262.38" rx="27.34" ry="44.24" transform="translate(-73.81 24.71) rotate(-16.79)" />
        </g>

        <path className="f-cls-2" d="M199.88,362.85c26.66-34.53,68.04-44.36,92.95-29.51,36.88,21.98,19.44,87.17,18.44,90.74-12.42,44.22-55.75,85.06-109.12,85.62-65.25.68-114.21-59.18-116.62-110.7-.27-5.87-1.76-50.94,28.03-66.4,24.1-12.5,61.04-1.68,86.31,30.25Z" />
        <path className="f-cls-7" d="M168.06,283.54c-.04,5.42,15.93,10.85,29.43,11.07,13.7.22,29.96-4.87,30.06-10.32.1-5.42-15.83-11.14-29.53-11.34-13.8-.19-29.92,5.15-29.96,10.58Z" />
        <ellipse className="f-cls-7" cx="283.71" cy="497.44" rx="40.51" ry="17.49" />
        <ellipse className="f-cls-7" cx="120.58" cy="497.44" rx="40.51" ry="17.49" />

        {/* Antenne Stamm und Ball */}
        <path className="f-cls-3" d="M190.3,137.21c15.81-32.26,26.27-44.65,35.59-53.38,2.67-2.51,6.5-5.89,8.55-4.8,2.31,1.24,1.19,7.54.69,10.25-5.13,27.46-30.97,45.64-40.03,52.01-2.56,1.8-5.51,3.6-6.5,2.74-1.14-.96.79-4.92,1.7-6.85v.03Z" />
        <circle className="f-cls-3" cx="237.75" cy="76.67" r="10.81" transform="translate(144.4 308.38) rotate(-85.93)" />

        {/* Animierte Funksignale an der Antenne */}
        <g className={isAnimating ? 'anim-signal-1' : 'opacity-0'}>
            <path className="f-cls-8" d="M217.45,82.93c-.25-1.52-2.02-13.83,6.67-22.75,6.94-7.14,20.04-11.6,30.03-4.59,9.68,6.79,11.16,20.59,5.74,29.99-5.93,10.29-17.98,11.52-19.23,11.63" />
        </g>
        <g className={isAnimating ? 'anim-signal-2' : 'opacity-0'}>
            <path className="f-cls-8" d="M206.85,86.8c-.35-2.22-2.95-20.3,9.8-33.44,10.19-10.49,29.42-17.04,44.11-6.75,14.22,9.95,16.38,30.25,8.45,44.06-8.71,15.09-26.4,16.93-28.23,17.08" />
        </g>
        <g className={isAnimating ? 'anim-signal-3' : 'opacity-0'}>
            <path className="f-cls-8" d="M195.58,90.94c-.46-2.98-3.95-27.19,13.13-44.78,13.65-14.05,39.4-22.82,59.07-9.04,19.04,13.33,21.94,40.51,11.31,59-11.66,20.21-35.36,22.67-37.8,22.88" />
        </g>

        <line className="f-cls-8" x1="155.6" y1="414.54" x2="155.6" y2="449.59" />
        <line className="f-cls-8" x1="171.8" y1="408.6" x2="171.8" y2="455.51" />
        <line className="f-cls-8" x1="188.37" y1="399.54" x2="188.37" y2="469.55" />
        <line className="f-cls-8" x1="204.95" y1="405.91" x2="204.95" y2="452.82" />
        <line className="f-cls-8" x1="220.84" y1="413.2" x2="220.84" y2="448.22" />
        <line className="f-cls-8" x1="237.05" y1="407.26" x2="237.05" y2="454.16" />
        <line className="f-cls-8" x1="253.63" y1="400.73" x2="253.63" y2="460.69" />
        <path className="f-cls-7" d="M111.11,202.28c-1.31-1.43,6.63-16.13,20.82-20.43,16.17-4.93,32.9,5.95,32.42,7.86-.42,1.65-13.39-4.17-30.22.57-14.59,4.11-21.88,13.24-23.02,12.03v-.03Z" />
        <path className="f-cls-7" d="M235.85,190.38c-.35-1.67,14.06-10.25,28.48-6.37,16.36,4.38,24.61,22.67,23.38,23.79-1.06.98-8.74-11.49-25.01-16.36-14.74-4.38-26.52.41-26.85-1.07Z" />
        <g>
            <path className="f-cls-4" d="M146.85,224.71c10.54-.01,19.89,16.61,20.15,30.81.26,14.37-8.81,24.37-11.37,27.02-2.93-.17-5.92-.31-8.96-.41-3.49-.12-6.91-.2-10.26-.24-2.68-3.18-10.17-12.93-9.71-26.36.48-14.02,9.57-30.8,20.15-30.81Z" />
            <circle className="f-cls-2" cx="142.09" cy="239.13" r="8.72" />
        </g>
        <path className="f-cls-4" d="M250.59,228.19c10.54-.01,19.89,16.61,20.15,30.81.26,14.37-8.81,24.37-11.37,27.02-2.93-.17-5.92-.31-8.96-.41-3.49-.12-6.91-.2-10.26-.24-2.68-3.18-10.17-12.93-9.71-26.36.48-14.02,9.57-30.8,20.15-30.81Z" />
        <circle className="f-cls-2" cx="245.84" cy="242.61" r="8.72" />

        {/* Körper und Elemente der NEUEN kleinen Figur (Orange/Yellow) */}
        <path className={`f-cls-5-${id}`} d="M463.38,444.45c-1.61,11.7-5.98,43.56-32.4,59.49-25.36,15.3-54.02,5.66-65.02,1.96-9.85-3.32-42.58-14.32-53.48-45.5-9.11-26.1,2.69-50.22,7.52-60.11,7.3-14.92,15.77-25.09,20.13-29.56,5.28-5.41,41.9-41.72,77.28-31.88,37.93,10.55,51.16,67.66,45.94,105.61h.02Z" />
        <path className="f-cls-2" d="M405.34,383.74c-2.88,7.44-10,14.94-17.44,15.03-3.23.04-3.66-1.33-12.75-4.8-10.85-4.15-12.45-3.03-15.46-5.55-5.97-5.01-7.52-15.96-4.29-24.04,4.77-11.92,20.59-19.15,34.11-13.91,13.79,5.35,20.87,20.24,15.82,33.27Z" />
        <path className="f-cls-2" d="M454.4,400.02c-2.96,7.64-10.43,15.13-18.01,15.17-3.91.02-4.65-1.94-14.98-5.26-8.66-2.79-9.64-1.9-12.16-3.74-6.43-4.7-8.31-16.63-4.78-25.53,4.85-12.24,20.71-19.1,34.11-13.91,13.79,5.35,20.87,20.24,15.82,33.27Z" />
        <path className="f-cls-6" d="M387.14,358.68c6,2.91,10.12,9.75,11.41,15.86,2.62,12.45-5.99,24.33-1.98,27.27.78.57,1.74.59,2.31.54.6.94,1.49,1.99,2.53,1.97,3.92-.08,2.95-15.15,12.08-24.27,4.42-4.41,11.57-7.78,18.26-7.03,12.72,1.43,19.7,17.17,24.12,27.12,10.98,24.74,7.3,49.29,3.75,63.3,18.13-59.23-7.89-113.15-40.14-123.95-35.42-11.87-96.52,22.19-109.82,92.63,6.3-18.92,19.47-48.15,46.2-65.31,7.28-4.67,20.67-13.27,31.26-8.14Z" />

        {/* Small Friend: Rechte und linke Hand (Winkend animiert) */}
        <g className={isAnimating ? 'anim-f-wave-right' : ''}>
            <ellipse className="f-cls-6" cx="473.81" cy="417.43" rx="21.47" ry="13.27" transform="translate(-153.99 485.31) rotate(-47.55)" />
        </g>
        <g className={isAnimating ? 'anim-f-wave-left' : ''}>
            <ellipse className="f-cls-6" cx="332.21" cy="370.01" rx="21.47" ry="13.27" transform="translate(-39.7 700.1) rotate(-89.67)" />
        </g>

        <path className="f-cls-2" d="M388.86,438.48c17.3-12.21,37.89-10.85,47.32-.41,13.96,15.46-3.44,43.2-4.41,44.71-12.08,18.73-38.01,31.48-62.83,24.11-30.36-9.01-44.51-43.76-38.27-68,.71-2.76,6.46-23.87,22.49-26.79,12.96-2.35,28.55,7.94,35.71,26.36Z" />
        <path className="f-cls-7" d="M385.43,397.15c-.79,2.51,5.84,7.31,12.06,9.34,6.32,2.06,14.59,2.02,15.41-.49.82-2.5-5.75-7.43-12.07-9.47-6.37-2.06-14.61-1.89-15.41.63Z" />
        <ellipse className="f-cls-7" cx="408.5" cy="512.87" rx="19.66" ry="8.49" transform="translate(-25.96 21.8) rotate(-2.96)" />
        <ellipse className="f-cls-7" cx="342.45" cy="503.7" rx="19.66" ry="8.49" transform="translate(-177.97 187.23) rotate(-24.49)" />
        <path className="f-cls-7" d="M370.63,351.33c-.41-.85,5.38-6.53,12.57-6.5,8.2.03,14.41,7.46,13.91,8.28-.43.7-5.61-3.85-14.09-4.05-7.35-.18-12.04,3.01-12.4,2.29h0Z" />
        <path className="f-cls-7" d="M430.18,363.63c.07-.82,7.99-2.75,14.12,1.12,6.96,4.37,8.18,14.03,7.44,14.37-.63.3-2.41-6.58-9.26-11.16-6.21-4.14-12.36-3.6-12.3-4.33Z" />
        <g>
            <path className="f-cls-4" d="M384,366.84c4.89,1.5,6.85,10.54,4.94,17.17-1.93,6.7-7.57,10.04-9.13,10.91-1.34-.5-2.7-.99-4.1-1.47-1.6-.56-3.18-1.08-4.73-1.58-.79-1.86-2.87-7.45-.74-13.61,2.22-6.43,8.84-12.92,13.75-11.41Z" />
            <circle className="f-cls-2" cx="379.73" cy="372.85" r="4.23" />
        </g>
        <path className="f-cls-4" d="M431.61,383.27c4.89,1.5,6.85,10.54,4.94,17.17-1.93,6.7-7.57,10.04-9.13,10.91-1.34-.5-2.7-.99-4.1-1.47-1.6-.56-3.18-1.08-4.73-1.58-.79-1.86-2.87-7.45-.74-13.61,2.22-6.43,8.84-12.92,13.75-11.41Z" />
        <circle className="f-cls-2" cx="427.35" cy="389.28" r="4.23" />
    </svg>
);


// ==========================================
// NEU: 5. Happy / Brief (Mail) SVG Komponente
// ==========================================
const HappyMascot = ({ isAnimating, id }: { isAnimating: boolean, id: string }) => (
    <svg viewBox="0 0 388.26 552.55" className={`w-full h-full overflow-visible ${isAnimating ? 'is-animating' : 'not-animating'}`}>
        <defs>
            <style>{`
                .h-cls-grad-${id} { fill: url(#happy-grad-${id}); }
                .h-cls-white-stroke { fill: #fff; stroke: #eb5d63; stroke-miterlimit: 10; stroke-width: 5px; }
                .h-cls-env-bg { fill: #fff; stroke: #f8c9dd; stroke-miterlimit: 10; stroke-width: 5px; }
                .h-cls-white { fill: #fff; }
                .h-cls-stroke { stroke: #eb5d63; stroke-miterlimit: 10; stroke-width: 5px; fill: none; }
                .h-cls-red { fill: #eb5d63; }
                .h-cls-black { fill: #1e1e1c; }
                .h-cls-darkred { fill: #8f2113; }

                /* Basis für die Animationen */
                .happy-flap-closed, .happy-flap-open {
                    transform-origin: 194.13px 299.28px; /* Perfekte Faltkante des Briefes in exakten Pixeln */
                    transition: transform 0.35s ease-in-out, opacity 0s linear;
                }
                .happy-mascot {
                    transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0s linear;
                }

                /* --- IDLE / GESCHLOSSEN --- */
                .not-animating .happy-flap-closed {
                    transform: scaleY(1);
                    opacity: 1;
                    /* Warten bis Maskottchen unten ist, bevor der Deckel schließt */
                    transition-delay: 0.35s, 0.5s; 
                }
                .not-animating .happy-flap-open {
                    transform: scaleY(0);
                    opacity: 0;
                    transition-delay: 0.35s, 0.5s;
                }
                .not-animating .happy-mascot {
                    transform: translateY(140px);
                    opacity: 0; /* Komplett unsichtbar im Idle */
                    /* Gleitet direkt runter, verschwindet fast ganz unten */
                    transition-delay: 0s, 0.35s; 
                }

                /* --- ANIMATING / OFFEN --- */
                .is-animating .happy-flap-closed {
                    transform: scaleY(0);
                    opacity: 0;
                    /* Klappt direkt auf */
                    transition-delay: 0s, 0.175s; 
                }
                .is-animating .happy-flap-open {
                    transform: scaleY(1);
                    opacity: 1;
                    transition-delay: 0s, 0.175s;
                }
                .is-animating .happy-mascot {
                    transform: translateY(0);
                    opacity: 1;
                    /* Wartet, bis der Deckel offen ist, dann springt es hoch */
                    transition-delay: 0.3s, 0.3s; 
                }
            `}</style>
            <linearGradient id={`happy-grad-${id}`} x1="195.13" y1="419.65" x2="195.13" y2="123.65" gradientTransform="translate(0 548.87) scale(1 -1)" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" />
                <stop offset="1" stopColor="#eb5d63" />
            </linearGradient>

            {/* Maske, damit das Maskottchen nie unter dem Brief herausguckt */}
            <clipPath id={`mascot-clip-${id}`}>
                <rect x="-100" y="-100" width="700" height="625" />
            </clipPath>
        </defs>

        {/* Der weiße Hintergrund-Body des Briefes, damit er nicht transparent ist */}
        <rect className="h-cls-env-bg" x="2.5" y="300" width="383.26" height="229.04" rx="12" ry="12" />

        {/* 1. Offene Lasche (Hinter dem Maskottchen) */}
        <path className="h-cls-white-stroke happy-flap-open" d="M17.44,300c-1.9-.23-3.06-.8-3.47-1.7-3.84-8.43,56.69-46.15,181.58-113.18,161.33,78.49,182,104.16,178.59,113.85-.12.35-.29.7-.48,1.03H17.44Z" />

        {/* 2. Maskottchen (Gleitet hoch und runter) in einer Schnittmaske (clipPath) */}
        <g clipPath={`url(#mascot-clip-${id})`}>
            <g className="happy-mascot">
                <path className={`h-cls-grad-${id}`} d="M349.79,309.38c10.3,46.94,5.12,87.29-.01,111.78-47.02,3.5-99.26,5.12-155.87,3.33-57.43-1.81-110.16-6.83-157.42-13.43-2.58-24.26-3.85-59.89,4.15-101.68,2.88-15.07,8.11-42.92,21.7-70.44,18.31-37.07,68.8-107.59,132.85-109.68,80.3-2.61,138.46,106.51,154.6,180.11Z" />
                <ellipse className="h-cls-white" cx="142.57" cy="224.76" rx="55.18" ry="52.13" />
                <ellipse className="h-cls-white" cx="248.97" cy="224.5" rx="55.18" ry="52.13" />
                <path className="h-cls-red" d="M147.6,186.71c13.35,2.47,25.67,12.51,32.08,24.31,13.06,24.01.5,53.1,9.5,56.71,2.57,1.03,5.66-.5,8.04-2.13,1.82,1.12,4.74,2.56,7.19,1.53,8.6-3.61-3.51-31.4,8.06-54.31,6.08-12.03,18.55-22.44,31.7-24.92,28.24-5.34,54.24,26.78,63.96,38.78,43.33,53.5,42.46,117.87,42.53,117.86.1-.02,7.89-106.2-60.54-172.6-10.49-10.18-43.38-42.08-90.46-42.62-60.19-.69-100.66,50.53-115.88,69.79-55.79,70.61-47.33,155.87-44.21,179.26-.18-29.69,2.46-117.07,53.55-165.97,10.95-10.48,31.33-29.98,54.45-25.7Z" />
                <path className="h-cls-white" d="M201.66,320.27c36.22.05,68.23,24.59,77.72,59.68-18.17,30.21-51.46,47.58-85.46,44.54-45.18-4.03-67.83-41.97-69.9-45.56,9.86-34.66,41.73-58.7,77.64-58.66Z" />
                <path className="h-cls-darkred" d="M228.27,266.66c-.25-6.71-25.57-8.09-28.21-8.21-9.41-.46-30.76-.02-31.4,6.11-.57,5.36,14.68,15.25,30.11,15.51,14.65.24,29.7-8.17,29.5-13.41Z" />
                <path className="h-cls-red" d="M189.81,117.19c15.81-32.26,26.27-44.65,35.59-53.38,2.67-2.51,6.5-5.89,8.55-4.8,2.31,1.24,1.19,7.54.69,10.25-5.13,27.46-30.97,45.64-40.03,52.01-2.56,1.8-5.51,3.6-6.5,2.74-1.14-.96.79-4.92,1.7-6.85v.03Z" />
                <circle className="h-cls-red" cx="237.26" cy="56.64" r="10.81" transform="translate(163.92 289.28) rotate(-85.93)" />
                <path className="h-cls-stroke" d="M216.96,62.9c-.25-1.52-2.02-13.83,6.67-22.75,6.94-7.14,20.04-11.6,30.03-4.59,9.68,6.79,11.16,20.59,5.74,29.99-5.93,10.29-17.98,11.52-19.23,11.63" />
                <path className="h-cls-stroke" d="M206.36,66.77c-.35-2.22-2.95-20.3,9.8-33.44,10.19-10.49,29.42-17.04,44.11-6.75,14.22,9.95,16.38,30.25,8.45,44.06-8.71,15.09-26.4,16.93-28.23,17.08" />
                <g>
                    <ellipse className="h-cls-black" cx="142.87" cy="246.31" rx="20.15" ry="30.81" />
                    <circle className="h-cls-white" cx="137.38" cy="233.24" r="9.32" />
                </g>
                <path className="h-cls-darkred" d="M103.67,185.13c-1.31-1.43,6.63-16.13,20.82-20.43,16.17-4.93,32.9,5.95,32.42,7.86-.42,1.65-13.39-4.17-30.22.57-14.59,4.11-21.88,13.24-23.02,12.03v-.03Z" />
                <path className="h-cls-darkred" d="M236.03,176.41c-.35-1.67,14.06-10.25,28.48-6.37,16.36,4.38,24.61,22.67,23.38,23.79-1.06.98-8.74-11.49-25.01-16.36-14.74-4.38-26.52.41-26.85-1.07Z" />
                <ellipse className="h-cls-red" cx="351.58" cy="296.06" rx="44.24" ry="27.34" transform="translate(-32.04 549.23) rotate(-73.52)" />
                <ellipse className="h-cls-red" cx="37.72" cy="284.98" rx="27.34" ry="44.24" transform="translate(-100.69 33.03) rotate(-21.24)" />
                <g>
                    <ellipse className="h-cls-black" cx="252.28" cy="246.86" rx="20.15" ry="30.81" />
                    <circle className="h-cls-white" cx="246.74" cy="234.26" r="9.32" />
                </g>
            </g>
        </g>

        {/* 3. Umschlag Front (Maskiert automatisch das rutschende Maskottchen) */}
        <path className="h-cls-white-stroke" d="M372.24,529.04H16.02c-7.44,0-13.52-6.08-13.52-13.52v-202.72c0-7.44,6.08-13.52,13.52-13.52,59.37,38.29,118.74,76.59,178.11,114.88,59.37-38.29,118.74-76.59,178.11-114.88.91,0,5.69.11,9.55,3.97,2.45,2.45,3.97,5.83,3.97,9.55v202.72c0,7.44-6.08,13.52-13.52,13.52Z" />
        <path className="h-cls-stroke" d="M194.13,414.16c-59.37,38.29-118.74,76.59-178.11,114.88" />
        <line className="h-cls-stroke" x1="194.13" y1="414.16" x2="372.24" y2="529.04" />

        {/* 4. Geschlossene Lasche (Ganz Vorne, klappt ein/aus) */}
        <path className="h-cls-white-stroke happy-flap-closed" d="M16.02,299.28c-1.9.23-3.06.8-3.47,1.7-3.84,8.43,56.69,46.15,181.58,113.18,161.33-78.49,182-104.16,178.59-113.85-.12-.35-.29-.7-.48-1.03H16.02Z" />
    </svg>
);


const SupportMascot = ({ isAnimating, id }: { isAnimating: boolean, id: string }) => (
    <svg viewBox="40 0 356 552.55" className="w-full h-full overflow-visible">
        {/* viewBox="40 0 356 552.55" schneidet den leeren Raum links und rechts exakt ab, sodass das Maskottchen zentriert ist! */}
        <defs>
            <style>{`
                .s-cls-grad-${id} { fill: url(#support-grad-${id}); }
                .s-cls-white { fill: #fff; }
                .s-cls-white-stroke { fill: #fff; stroke: #eb5d63; stroke-width: 5px; stroke-miterlimit: 10; }
                .s-cls-red { fill: #eb5d63; }
                .s-cls-black { fill: #1e1e1c; }
                .s-cls-darkred { fill: #8f2113; }
                .s-cls-stroke { fill: none; stroke: #eb5d63; stroke-width: 5px; stroke-miterlimit: 10; }
                .s-cls-beak { fill: #8f2113; stroke: #f8c9dd; stroke-miterlimit: 10; }

                /* Sprech-Animation für den unteren Schnabel */
                @keyframes talk-${id} {
                    0%, 100% { transform: translateY(0); }
                    20% { transform: translateY(5px); }
                    40% { transform: translateY(1px); }
                    60% { transform: translateY(6px); }
                    80% { transform: translateY(2px); }
                }
                .anim-talk-${id} {
                    animation: talk-${id} 0.5s infinite;
                }
            `}</style>
            <linearGradient id={`support-grad-${id}`} x1="214.07" y1="400.43" x2="214.07" y2="39.98" gradientTransform="translate(0 548.87) scale(1 -1)" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" />
                <stop offset="1" stopColor="#eb5d63" />
            </linearGradient>
        </defs>

        <path className={`s-cls-grad-${id}`} d="M368.39,328.6c3.93,24.01,14.65,89.42-27.72,136.81-40.66,45.51-102.95,43.91-126.86,43.3-21.42-.56-92.54-2.36-132.93-57.16-33.78-45.87-25.18-100.54-21.65-122.95,5.33-33.81,15.84-58.99,21.7-70.44,7.11-13.86,57.21-107.6,132.85-109.68,81.1-2.23,141.81,102.21,154.55,180.11h.05Z" />
        <path className="s-cls-white" d="M217.25,244.23c-1.77,24.83-24.02,39.43-25.22,40.19-11.61,7.26-23.14,8.06-28.57,8.05-16.24-.02-27.97-7.35-33.26-11.33-2.12-1.59-25.13-19.2-23.03-44.74,2.16-26.36,28.94-50.21,58.74-48.08,30.4,2.16,53.39,27.2,51.34,55.92Z" />
        <path className="s-cls-white" d="M323.75,246.53c-1.75,24.64-23.79,39.24-26.26,40.79-3.79,2.39-16.07,9.88-32.89,8.48-13.57-1.13-22.79-7.45-26.03-9.73-1.44-1.01-27.08-19.66-24.9-47.37,2.12-27.06,29.2-50.19,58.74-48.08,30.4,2.16,53.39,27.2,51.34,55.92Z" />
        <path className="s-cls-red" d="M166.2,205.92c13.59,2.08,25.84,13.06,32.08,24.31,12.72,22.94,2.97,51.55,12.66,54.92,1.89.66,3.78.1,4.88-.34,1.76,1.49,4.14,3.02,6.18,2.35,7.68-2.53-3.39-31.63,9.07-55.12,6.03-11.37,18.07-22.35,31.7-24.92,25.92-4.9,49.22,21.85,63.96,38.78,36.63,42.06,44.29,92.65,45.79,122.39-.23-127.65-84.19-218.06-154.25-219.76-76.96-1.88-176.64,102.27-160.09,249.05.93-41.09,9.12-106.64,51.37-156.66,11.5-13.61,32.67-38.67,56.63-35Z" />
        <ellipse className="s-cls-red" cx="361.9" cy="362.07" rx="27.34" ry="44.24" />
        <ellipse className="s-cls-red" cx="68.12" cy="362.07" rx="27.34" ry="44.24" />
        <ellipse className="s-cls-white" cx="220.26" cy="424.19" rx="81.58" ry="84.7" />
        <path className="s-cls-darkred" d="M183.45,281.24c-.34,5.43,16.69,12.43,32.29,12.56,15.11.13,31.89-6.16,31.72-11.53-.17-5.44-17.76-9.79-31.19-10.12-14.21-.35-32.47,3.58-32.82,9.09Z" />
        <ellipse className="s-cls-darkred" cx="301.82" cy="496.63" rx="40.51" ry="17.49" />
        <ellipse className="s-cls-darkred" cx="138.68" cy="496.63" rx="40.51" ry="17.49" />
        <path className="s-cls-red" d="M207.31,135.6c15.81-32.26,26.27-44.65,35.59-53.38,2.67-2.51,6.5-5.89,8.55-4.8,2.31,1.24,1.19,7.54.69,10.25-5.13,27.46-30.97,45.64-40.03,52.01-2.56,1.8-5.51,3.6-6.5,2.74-1.14-.96.79-4.92,1.7-6.85v.03Z" />
        <circle className="s-cls-red" cx="254.75" cy="75.06" r="10.81" transform="translate(161.8 323.84) rotate(-85.93)" />
        <path className="s-cls-stroke" d="M234.45,81.31c-.25-1.52-2.02-13.83,6.67-22.75,6.94-7.14,20.04-11.6,30.03-4.59,9.68,6.79,11.16,20.59,5.74,29.99-5.93,10.29-17.98,11.52-19.23,11.63" />
        <path className="s-cls-stroke" d="M223.85,85.19c-.35-2.22-2.95-20.3,9.8-33.44,10.19-10.49,29.42-17.04,44.11-6.75,14.22,9.95,16.38,30.25,8.45,44.06-8.71,15.09-26.4,16.93-28.23,17.08" />
        <line className="s-cls-stroke" x1="173.71" y1="413.73" x2="173.71" y2="448.78" />
        <line className="s-cls-stroke" x1="189.9" y1="407.79" x2="189.9" y2="454.69" />
        <line className="s-cls-stroke" x1="206.48" y1="398.73" x2="206.48" y2="468.73" />
        <line className="s-cls-stroke" x1="223.05" y1="405.1" x2="223.05" y2="452" />
        <line className="s-cls-stroke" x1="238.94" y1="412.38" x2="238.94" y2="447.41" />
        <line className="s-cls-stroke" x1="255.16" y1="406.44" x2="255.16" y2="453.35" />
        <line className="s-cls-stroke" x1="271.74" y1="399.92" x2="271.74" y2="459.87" />
        <path className="s-cls-darkred" d="M129.22,212.38c-1.31-1.43,6.63-16.13,20.82-20.43,16.17-4.93,32.9,5.95,32.42,7.86-.42,1.65-13.39-4.17-30.22.57-14.59,4.11-21.88,13.24-23.02,12.03v-.03Z" />
        <path className="s-cls-darkred" d="M253.96,201.99c-.35-1.67,14.06-10.25,28.48-6.37,16.36,4.38,24.61,22.67,23.38,23.79-1.06.98-8.74-11.49-25.01-16.36-14.74-4.38-26.52.41-26.85-1.07Z" />
        <g>
            <path className="s-cls-black" d="M164.96,223.9c10.68-.01,20.05,16.74,20.15,30.81.11,14.88-10.11,32.05-20.99,31.75-10.72-.3-19.58-17.47-19.32-31.75.25-13.95,9.31-30.8,20.15-30.81Z" />
            <circle className="s-cls-white" cx="160.2" cy="238.32" r="8.72" />
        </g>
        <path className="s-cls-black" d="M268.7,227.37c10.79,0,19.99,16.78,20.15,30.81.18,15.12-10.06,32.55-20.92,32.28-10.72-.27-19.73-17.71-19.39-32.28.33-13.92,9.34-30.8,20.15-30.81Z" />
        <circle className="s-cls-white" cx="263.94" cy="241.79" r="8.72" />
        <path className="s-cls-white-stroke" d="M209.99,151.74c-45.52,4.25-97.68,55.99-109.67,82.01-1.6,3.48-7.39,17.15-19.65,20.93-6.28,1.93-15.53,1.7-17.99-2-10.69-16.08,54.83-120.97,145.89-127.91,104.71-7.98,191.93,117.47,177.87,143.23-3.16,5.8-13.14,8.61-20.65,7.33-17.23-2.94-24.58-28.02-31.49-42.88-21.09-45.34-79.71-84.87-124.31-80.71Z" />
        <ellipse className="s-cls-white-stroke" cx="81.33" cy="266.73" rx="33.31" ry="54.21" />
        <ellipse className="s-cls-white-stroke" cx="361.9" cy="266.73" rx="33.31" ry="54.21" />
        <path className="s-cls-white-stroke" d="M389.05,239.25c-2.14-1.17-9.15,27.84-36.64,45.97-33.12,21.83-69.27,10.25-81.94,33.98-1.38,2.58-3.97,7.44-2,10.66,6.28,10.24,56.64.18,88.6-30.64,26.07-25.14,34.29-58.69,31.98-59.96Z" />
        <ellipse className="s-cls-white-stroke" cx="263.9" cy="320.01" rx="24.96" ry="19.48" />

        {/* Hier animieren wir den unteren Schnabelteil */}
        <g className={isAnimating ? `anim-talk-${id}` : ''}>
            <path id="Schnabel_unten" className="s-cls-beak" d="M183.37,282.06c-.7,2.12,14.33,12.42,32.29,12.56,17.49.14,32.35-9.4,31.72-11.53-.53-1.8-11.86,2.39-32.37,2.03-20.18-.35-31.06-4.8-31.63-3.06Z" />
        </g>
    </svg>
);