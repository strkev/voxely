import React from 'react';

interface SettingsSliderProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    leftIcon?: React.ElementType;
    rightIcon?: React.ElementType;
    className?: string;
}

export const SettingsSlider: React.FC<SettingsSliderProps> = ({
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    label,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    className = ""
}) => {
    return (
        <div className={`flex items-center gap-4 ${className}`}>
            {LeftIcon && <LeftIcon className="w-4 h-4 text-text-muted shrink-0" />}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className="flex-1 h-1 rounded-full accent-primary cursor-pointer"
            />
            {RightIcon && <RightIcon className="w-4 h-4 text-text-muted shrink-0" />}
            {label && (
                <span className="text-[11px] font-mono font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-lg shrink-0">
                    {label}
                </span>
            )}
        </div>
    );
};
