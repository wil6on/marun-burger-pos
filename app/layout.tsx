// ============================================================================
// app/layout.tsx — Layout raíz con metadata PWA / mobile-web-app
// Reemplaza (o fusiona con) el layout.tsx que Next.js genera por defecto.
// ============================================================================

import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Marun Burger POS',
    description: 'Punto de venta offline-first de Marun Burger',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Marun POS',
    },
    icons: {
        icon: '/icons/icon-192.png',
        apple: '/icons/icon-192.png',
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1, // evita zoom accidental al tocar botones del POS
    userScalable: false,
    themeColor: '#111111',
    viewportFit: 'cover', // respeta el notch en iPhones (safe-area-inset)
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        // suppressHydrationWarning en html/body: algunas extensiones del
        // navegador (antivirus, bloqueadores) modifican el HTML antes de que
        // React termine de cargar, agregando atributos como
        // "bis_skin_checked". Eso no es un bug de la app, pero React lo
        // marca como advertencia de hidratación — esto la silencia sin
        // ocultar errores reales de hidratación que sí importan.
        <html lang="es" suppressHydrationWarning>
            <body suppressHydrationWarning>{children}</body>
        </html>
    );
}
