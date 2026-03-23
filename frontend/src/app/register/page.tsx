"use client";

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/useAuthStore';
import { ChevronLeft } from 'lucide-react';

const ALLOWED_PREFIXES = ['/room/', '/dashboard', '/settings'];
function getSafeRedirect(url: string | null): string {
    if (!url || !url.startsWith('/') || url.includes('//') || url.includes('\\')) return '/dashboard';
    if (ALLOWED_PREFIXES.some(p => url.startsWith(p))) return url;
    return '/dashboard';
}

export default function RegisterPage() {
    return (
        <Suspense>
            <RegisterForm />
        </Suspense>
    );
}

function RegisterForm() {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');
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

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',  // allows the server to set httpOnly auth_token cookie
                body: JSON.stringify({ name, password, inviteCode })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to register');
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
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md mb-6">
                <button
                    onClick={() => router.push('/')}
                    className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-main transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                </button>
            </div>
            <div className="w-full max-w-md bg-surface p-8 rounded-video shadow-flat border border-gray-100">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-6">
                        <Image src="/logo.png" alt="Voxely Logo" width={64} height={64} priority className="w-16 h-16 object-contain logo-dark-mode" />
                    </div>
                    <h1 className="text-2xl font-semibold text-text-main mb-2">Create an account</h1>
                    <p className="text-text-muted text-sm">Join to start your real-time communication</p>
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
                            placeholder="Choose a username"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            maxLength={50}
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
                            minLength={8}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-main mb-1.5 ml-1">Confirm Password</label>
                        <Input
                            type="password"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={8}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-main mb-1.5 ml-1">Invitation Code</label>
                        <Input
                            type="text"
                            placeholder="Enter your invite code"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value)}
                            required
                        />
                    </div>

                    <Button type="submit" variant="primary" className="w-full mt-6" disabled={loading}>
                        {loading ? 'Creating account...' : 'Sign up'}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-text-muted">
                    Already have an account?{' '}
                    <Link href={redirectTo !== '/dashboard' ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'} className="text-primary font-medium hover:underline">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
