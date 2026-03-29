import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useWindowWidth(defaultWidth: number = 1200) {
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : defaultWidth);
    
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    
    return windowWidth;
}

export function useThemeBackground(theme: string) {
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const bodyBg = document.body.style.backgroundColor;
        const htmlBg = document.documentElement.style.backgroundColor;

        // Use theme-aware background colors
        const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const bgVal = isDark ? '#030712' : '#F7F7F7';

        document.body.style.setProperty('background-color', bgVal, 'important');
        document.documentElement.style.setProperty('background-color', bgVal, 'important');
        return () => {
            document.body.style.backgroundColor = bodyBg;
            document.documentElement.style.backgroundColor = htmlBg;
        };
    }, [theme]);
}

export function usePreventTabClose(isActive: boolean) {
    useEffect(() => {
        if (!isActive) return; // Only warn if connected to room
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isActive]);
}

export function useLiveKitToken(roomId: string, user: { id: string; name: string } | null | undefined, authToken: string | null, authLoading: boolean, mounted: boolean) {
    const router = useRouter();
    const [livekitToken, setLivekitToken] = useState<string>('');
    const [e2eeKey, setE2eeKey] = useState<string>('');
    const [tokenError, setTokenError] = useState(false);

    useEffect(() => {
        if (!mounted) return;
        if (authLoading) return; // Wait for auth check to complete
        if (!user) { router.push('/login?redirect=' + encodeURIComponent(window.location.pathname)); return; }
        
        const fetchToken = async () => {
            setTokenError(false);
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/livekit/token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({ roomName: roomId, participantName: user.name, participantId: user.id }),
                });
                const data = await res.json();
                if (data.token) {
                    setLivekitToken(typeof data.token === 'string' ? data.token : data.token.token || '');
                    setE2eeKey(data.e2eeKey || '');
                }
                else setTokenError(true);
            } catch (err) { console.error(err); setTokenError(true); }
        };
        fetchToken();
    }, [user, roomId, router, mounted, authToken, authLoading]);

    return { livekitToken, setLivekitToken, e2eeKey, setE2eeKey, tokenError, setTokenError };
}
