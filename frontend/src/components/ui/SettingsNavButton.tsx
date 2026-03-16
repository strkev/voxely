import React from 'react';

interface SettingsNavButtonProps {
    isActive: boolean;
    onClick: () => void;
    icon: React.ElementType;
    label: string;
}

export const SettingsNavButton: React.FC<SettingsNavButtonProps> = ({
    isActive,
    onClick,
    icon: Icon,
    label
}) => {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 ${
                isActive
                    ? 'bg-white text-primary shadow-sm ring-1 ring-black/5'
                    : 'text-text-muted hover:text-text-main hover:bg-gray-100/20 dark:hover:bg-black/10'
            }`}
        >
            <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-primary' : 'text-text-muted'}`} />
            {label}
        </button>
    );
};
