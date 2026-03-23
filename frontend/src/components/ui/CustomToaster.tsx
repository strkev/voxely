"use client";

import { useEffect } from 'react';
import toast, { Toaster, useToasterStore } from 'react-hot-toast';

/**
 * Custom Toaster component that limits the number of simultaneously visible toasts to 3.
 * It also applies a short 1500ms default duration.
 */
const TOAST_LIMIT = 3;

export function CustomToaster() {
    const { toasts } = useToasterStore();

    useEffect(() => {
        // Find visible toasts that exceed the limit
        const visibleToasts = toasts.filter((t) => t.visible);
        
        if (visibleToasts.length > TOAST_LIMIT) {
            // Dismiss the oldest visible toasts that exceed the limit
            const toastsToDismiss = visibleToasts.slice(0, visibleToasts.length - TOAST_LIMIT);
            toastsToDismiss.forEach((t) => toast.dismiss(t.id));
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
