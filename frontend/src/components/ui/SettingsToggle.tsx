import React from 'react';

interface SettingsToggleProps {
    label: string;
    description?: string;
    value: boolean;
    onChange: () => void;
    icon?: React.ElementType;
}

export const SettingsToggle: React.FC<SettingsToggleProps> = ({
    label,
    description,
    value,
    onChange,
    icon: Icon
}) => {
    return (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 transition-all hover:bg-gray-100/20">
            <div className="flex items-center gap-3">
                {Icon && (
                    <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                        <Icon className="w-5 h-5 text-primary" />
                    </div>
                )}
                <div>
                    <h4 className="text-sm font-bold text-text-main">{label}</h4>
                    {description && <p className="text-[11px] text-text-muted">{description}</p>}
                </div>
            </div>
            <button
                onClick={onChange}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${value ? 'bg-primary' : 'bg-gray-200'}`}
            >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
        </div>
    );
};
