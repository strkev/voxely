import React from 'react';

interface SettingsOptionButtonProps {
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
}

export const SettingsOptionButton: React.FC<SettingsOptionButtonProps> = ({
    active = false,
    onClick,
    children,
    className = "",
    disabled = false
}) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`py-3 rounded-2xl text-xs font-bold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${
                active
                    ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[0.98]'
                    : 'bg-gray-50 text-text-main hover:bg-gray-100/40 border border-transparent'
            } ${className}`}
        >
            {children}
        </button>
    );
};
