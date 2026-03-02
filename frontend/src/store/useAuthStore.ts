import { create } from 'zustand';

export interface User {
    id: string;
    email: string;
    name: string;
}

interface AuthState {
    user: User | null;
    token: string | null;  // In-memory only – NOT persisted to localStorage
    setAuth: (user: User, token: string) => void;
    checkAuth: () => Promise<void>;
    logout: () => Promise<void>;
    deleteAccount: () => Promise<void>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export const useAuthStore = create<AuthState>()((set, get) => ({
    user: null,
    token: null,

    setAuth: (user, token) => set({ user, token }),

    /**
     * Restore auth state from the httpOnly cookie by calling GET /api/auth/me.
     * Called once on app mount by AuthProvider.
     */
    checkAuth: async () => {
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
}));
