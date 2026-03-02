import Link from "next/link";

export function Footer() {
    return (
        <footer className="w-full border-t border-gray-100 bg-surface py-4 px-6 sm:px-12">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-text-muted">
                <span>© {new Date().getFullYear()} Voxely</span>
                <div className="flex items-center gap-4">
                    <Link
                        href="/impressum"
                        className="hover:text-text-main transition-colors"
                    >
                        Impressum
                    </Link>
                    <Link
                        href="/datenschutz"
                        className="hover:text-text-main transition-colors"
                    >
                        Datenschutz
                    </Link>
                </div>
            </div>
        </footer>
    );
}
