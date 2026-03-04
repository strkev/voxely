"use client";

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/useAuthStore';

const ALLOWED_PREFIXES = ['/room/', '/dashboard', '/settings'];
function getSafeRedirect(url: string | null): string {
    if (!url || !url.startsWith('/') || url.includes('//') || url.includes('\\')) return '/dashboard';
    if (ALLOWED_PREFIXES.some(p => url.startsWith(p))) return url;
    return '/dashboard';
}

function LoginForm() {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectTo = getSafeRedirect(searchParams.get('redirect'));
    const setAuth = useAuthStore((state) => state.setAuth);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',  // allows the server to set httpOnly auth_token cookie
                body: JSON.stringify({ name, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to login');
            }

            setAuth(data.user, data.token);
            router.push(redirectTo);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-surface p-8 rounded-video shadow-flat border border-gray-100">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-semibold text-text-main mb-2">Welcome back</h1>
                    <p className="text-text-muted text-sm">Sign in to your account to continue</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-card text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-main mb-1.5 ml-1">Username</label>
                        <Input
                            type="text"
                            placeholder="Your username"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-main mb-1.5 ml-1">Password</label>
                        <Input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <Button type="submit" variant="primary" className="w-full mt-6" disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign in'}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-text-muted">
                    Don&apos;t have an account?{' '}
                    <Link href={redirectTo !== '/dashboard' ? `/register?redirect=${encodeURIComponent(redirectTo)}` : '/register'} className="text-primary font-medium hover:underline">
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}
