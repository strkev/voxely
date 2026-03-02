"use client";

import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Checks for an existing auth session on mount (via httpOnly cookie).
 * Wrap around page content in layout.tsx.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
    const checkAuth = useAuthStore(s => s.checkAuth);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    return <>{children}</>;
}
