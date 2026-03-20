import { create } from 'zustand';

export interface User {
    id: string;
    name: string;
    avatarColor: string;
}

interface AuthState {
    user: User | null;
    token: string | null;  // In-memory only – NOT persisted to localStorage
    isLoading: boolean;     // True while checkAuth is in progress
    setAuth: (user: User, token: string) => void;
    checkAuth: () => Promise<void>;
    logout: () => Promise<void>;
    deleteAccount: () => Promise<void>;
    updateProfile: (data: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export const useAuthStore = create<AuthState>()((set, get) => ({
    user: null,
    token: null,
    isLoading: true, // Start as true — assume we need to check

    setAuth: (user, token) => set({ user, token }),

    /**
     * Restore auth state from the httpOnly cookie by calling GET /api/auth/me.
     * Called once on app mount by AuthProvider.
     */
    checkAuth: async () => {
        set({ isLoading: true });
        try {
            const res = await fetch(`${API_URL}/api/auth/me`, {
                credentials: 'include',
            });
            if (res.ok) {
                const data = await res.json();
                set({ user: data.user, token: data.token });
            }
        } catch {
            // Silently fail — user stays logged out
        } finally {
            set({ isLoading: false });
        }
    },

    /**
     * Logout: tells the server to blacklist the token and clear the httpOnly cookie,
     * then clears local in-memory state.
     */
    logout: async () => {
        const { token } = get();
        try {
            await fetch(`${API_URL}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include',  // needed to clear the cookie
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            set({ user: null, token: null });
        }
    },

    deleteAccount: async () => {
        const { token, logout } = get();
        if (!token) return;
        try {
            await fetch(`${API_URL}/api/auth/me`, {
                method: 'DELETE',
                credentials: 'include',
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch (err) {
            console.error('Delete account error:', err);
        } finally {
            await logout();
        }
    },

    updateProfile: async (data) => {
        const { token } = get();
        try {
            const res = await fetch(`${API_URL}/api/auth/me`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: 'include',
                body: JSON.stringify(data),
            });
            const result = await res.json();
            if (!res.ok) return { success: false, error: result.error || 'Update failed' };

            set({ user: result.user, token: token! });
            return { success: true };
        } catch (err: unknown) {
            return { success: false, error: err instanceof Error ? err.message : 'Error' };
        }
    },
}));
