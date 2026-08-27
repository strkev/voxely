"use client";

import { useEffect } from 'react';
import toast, { Toaster, useToasterStore } from 'react-hot-toast';

/**
 * Custom Toaster component that limits the number of simultaneously visible toasts to 1.
 * It also applies a short 1500ms default duration.
 */
const TOAST_LIMIT = 1;

export function CustomToaster() {
    const { toasts } = useToasterStore();

    useEffect(() => {
        const visibleToasts = toasts.filter((t) => t.visible);
        
        if (visibleToasts.length > TOAST_LIMIT) {
            const toastsToDismiss = visibleToasts.slice(0, visibleToasts.length - TOAST_LIMIT);
            toastsToDismiss.forEach((t) => toast.remove(t.id));
        }
    }, [toasts]);

    return (
        <Toaster 
            position="top-center" 
            reverseOrder={false} 
            toastOptions={{
                duration: 1500,
            }}
        />
    );
}
