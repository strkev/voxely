"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDevices } from '@/hooks/useDevices';
import { AudioVideoTab } from '@/components/settings/AudioVideoTab';
import { QualityTab } from '@/components/settings/QualityTab';
import { InterfaceTab } from '@/components/settings/InterfaceTab';
import { SoundsTab } from '@/components/settings/SoundsTab';
import { ProfileTab } from '@/components/settings/ProfileTab';
import { AccountTab } from '@/components/settings/AccountTab';
import { SettingsNavButton } from '@/components/ui/SettingsNavButton';
import {
    X, Settings, Mic, Monitor, Palette, Bell, User, Lock, ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

type TabId = 'audio-video' | 'quality' | 'interface' | 'sounds' | 'profile' | 'account';

interface SettingsModalProps {
    onClose: () => void;
    defaultTab?: TabId;
}

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'audio-video', label: 'Audio & Video', icon: Mic },
    { id: 'quality', label: 'Stream Quality', icon: Monitor },
    { id: 'interface', label: 'Interface', icon: Palette },
    { id: 'sounds', label: 'Sounds', icon: Bell },
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'account', label: 'Account', icon: Lock },
];

export function SettingsModal({ onClose, defaultTab }: SettingsModalProps) {
    const { user } = useAuthStore();
    const devices = useDevices();

    const [activeTab, setActiveTab] = useState<TabId>(defaultTab || 'audio-video');
    const [isNavExpanded, setIsNavExpanded] = useState(false);
    const backdropRef = useRef<HTMLDivElement>(null);

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    // Escape key to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!user || typeof document === 'undefined') return null;

    const renderTab = () => {
        switch (activeTab) {
            case 'audio-video':
                return (
                    <AudioVideoTab
                        audioDevices={devices.audioDevices}
                        videoDevices={devices.videoDevices}
                        audioOutputDevices={devices.audioOutputDevices}
                        activeAudioId={devices.activeAudioId}
                        activeVideoId={devices.activeVideoId}
                        activeAudioOutputId={devices.activeAudioOutputId}
                    />
                );
            case 'quality':
                return <QualityTab />;
            case 'interface':
                return <InterfaceTab />;
            case 'sounds':
                return <SoundsTab />;
            case 'profile':
                return <ProfileTab />;
            case 'account':
                return <AccountTab onClose={onClose} />;
            default:
                return null;
        }
    };

    return createPortal(
        <div
            ref={backdropRef}
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
        >
            <div className="bg-surface rounded-3xl shadow-2xl border border-white/10 w-full max-w-4xl flex flex-col md:flex-row overflow-hidden h-[600px] max-h-[90vh]">
                {/* Sidebar Navigation */}
                <div className={`w-full md:w-64 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col shrink-0 transition-all duration-300 ${isNavExpanded ? 'h-auto' : 'h-auto md:h-full'}`}>
                    <div className="p-6 md:p-8 flex items-center justify-between">
                        <h2 className="text-xl font-bold text-text-main flex items-center gap-2">
                            <Settings className="w-5 h-5 text-primary" />
                            <span className="md:inline">Settings</span>
                        </h2>
                        {/* Close Button on Mobile (Upper Right) */}
                        <button
                            onClick={onClose}
                            className="md:hidden p-2 rounded-xl text-text-muted hover:bg-gray-100 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Navigation - Hidden on mobile if not expanded */}
                    <nav className={`flex-1 px-4 pt-2 pb-6 space-y-1 overflow-y-auto hidden md:block`}>
                        {tabs.map((tab) => (
                            <SettingsNavButton
                                key={tab.id}
                                isActive={activeTab === tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    setIsNavExpanded(false);
                                }}
                                icon={tab.icon}
                                label={tab.label}
                            />
                        ))}
                    </nav>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-white min-h-0">
                    <div className="flex flex-col border-b border-gray-50 shrink-0">
                        <div className="flex items-center justify-between px-6 md:px-8 py-4 md:py-6">
                            <h3 className="text-base font-bold text-text-main">
                                {tabs.find(t => t.id === activeTab)?.label}
                            </h3>
                            <div className="flex items-center gap-2">
                                {/* Mobile Expand Toggle */}
                                <button
                                    onClick={() => setIsNavExpanded(!isNavExpanded)}
                                    className="md:hidden p-2 rounded-xl text-primary hover:bg-primary/5 transition-all"
                                >
                                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${isNavExpanded ? 'rotate-180' : 'rotate-0'}`} />
                                </button>
                                {/* Desktop Close Button */}
                                <button
                                    onClick={onClose}
                                    className="hidden md:block p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-gray-100 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Mobile Navigation List (Expands under active tab) */}
                        {isNavExpanded && (
                            <nav className="md:hidden px-4 pt-1 pb-4 space-y-1 animate-in slide-in-from-top-2 duration-200">
                                {tabs.map((tab) => (
                                    <SettingsNavButton
                                        key={tab.id}
                                        isActive={activeTab === tab.id}
                                        onClick={() => {
                                            setActiveTab(tab.id);
                                            setIsNavExpanded(false);
                                        }}
                                        icon={tab.icon}
                                        label={tab.label}
                                    />
                                ))}
                            </nav>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 scroll-smooth overscroll-contain">
                        {renderTab()}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
