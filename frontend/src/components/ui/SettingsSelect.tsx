"use client";

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface SettingsSelectProps {
    value: string | null;
    onChange: (val: string) => void;
    options: { value: string; label: string }[];
    disabled?: boolean;
    placeholder?: string;
}

export function SettingsSelect({ value, onChange, options, disabled, placeholder = "Select an option" }: SettingsSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === value);

    return (
        <div ref={containerRef} className="relative w-full">
            <button
                type="button"
                className={`w-full flex items-center justify-between bg-gray-50 border border-gray-100/50 rounded-xl px-4 py-2.5 text-sm font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer hover:bg-gray-100/50 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
            >
                <span className="truncate pr-4">{selectedOption ? selectedOption.label : placeholder}</span>
                <ChevronDown className={`w-4 h-4 text-text-muted transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-[100] w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2">
                    <div className="max-h-60 overflow-y-auto py-1 scrollbar-hide">
                        {options.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500">No options available</div>
                        ) : (
                            options.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(option.value);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors hover:bg-gray-50 ${option.value === value ? 'text-primary font-semibold bg-primary/5' : 'text-text-main'}`}
                                >
                                    <span className="truncate pr-3">{option.label}</span>
                                    {option.value === value && (
                                        <Check className="w-4 h-4 shrink-0 text-primary" />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
