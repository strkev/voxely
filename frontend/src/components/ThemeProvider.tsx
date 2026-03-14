"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/store/useSettingsStore";

export function ThemeProvider() {
    const theme = useSettingsStore((state) => state.theme);

    useEffect(() => {
        const root = document.documentElement;

        const applyTheme = (currentTheme: 'light' | 'dark') => {
            if (currentTheme === 'dark') {
                root.classList.add('dark');
                root.style.colorScheme = 'dark';
            } else {
                root.classList.remove('dark');
                root.style.colorScheme = 'light';
            }
        };

        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => {
                applyTheme(mediaQuery.matches ? 'dark' : 'light');
            };

            // Initial apply
            handleChange();

            // Listen for changes
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        } else {
            applyTheme(theme);
        }
    }, [theme]);

    return null;
}
