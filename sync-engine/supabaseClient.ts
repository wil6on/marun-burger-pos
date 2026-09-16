'use client';

// ============================================================================
// supabaseClient.ts — Cliente único de Supabase para pantallas conectadas
// directamente (no offline-first), como el panel del dueño. El POS usa su
// propio cliente dentro de syncWorker.ts porque además maneja la cola offline.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
    if (!client) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !anonKey) {
            throw new Error(
                'Faltan las variables NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
                'Verifica que exista .env.local en la raíz del proyecto y REINICIA "npm run dev" ' +
                '(Next.js solo lee ese archivo al arrancar el servidor, no en caliente).'
            );
        }

        client = createClient(url, anonKey);
    }
    return client;
}
