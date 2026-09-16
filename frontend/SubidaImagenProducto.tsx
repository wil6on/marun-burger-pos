'use client';

// ============================================================================
// SubidaImagenProducto.tsx — Drag & drop / clic para subir la foto de un
// platillo a Supabase Storage (bucket 'menu-images'), con vista previa
// instantánea y nombre de archivo único (evita sobrescribir imágenes).
//
// Se sube apenas se selecciona el archivo (no espera al "Guardar" del
// formulario) — así el usuario ve de inmediato si la subida funcionó, y el
// formulario que lo usa solo necesita guardar la URL pública resultante.
// ============================================================================

import { useState, useRef, DragEvent } from 'react';
import { getSupabaseBrowserClient } from '../sync-engine/supabaseClient';

const BUCKET = 'menu-images';

export default function SubidaImagenProducto({
    valorActual,
    onSubido,
}: {
    valorActual: string; // URL actual (si el platillo ya tenía imagen)
    onSubido: (url: string) => void;
}) {
    const supabase = getSupabaseBrowserClient();
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [subiendo, setSubiendo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [arrastrando, setArrastrando] = useState(false);
    const [mostrarUrlManual, setMostrarUrlManual] = useState(false);

    async function subirArchivo(file: File) {
        setError(null);

        if (!file.type.startsWith('image/')) {
            setError('Solo se permiten archivos de imagen (JPG, PNG, WEBP...).');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError('La imagen no puede pesar más de 5MB.');
            return;
        }

        // Vista previa inmediata, antes de que termine de subir
        const previewLocal = URL.createObjectURL(file);
        setPreview(previewLocal);
        setSubiendo(true);

        // Nombre único: UUID + extensión original, evita sobrescribir otras fotos
        const extension = file.name.split('.').pop() || 'jpg';
        const nombreArchivo = `${crypto.randomUUID()}.${extension}`;

        const { error: errorSubida } = await supabase.storage
            .from(BUCKET)
            .upload(nombreArchivo, file, { cacheControl: '3600', upsert: false });

        if (errorSubida) {
            setError('No se pudo subir la imagen: ' + errorSubida.message);
            setSubiendo(false);
            return;
        }

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(nombreArchivo);
        setSubiendo(false);
        onSubido(data.publicUrl);
    }

    function onDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setArrastrando(false);
        const file = e.dataTransfer.files?.[0];
        if (file) subirArchivo(file);
    }

    const imagenAMostrar = preview || valorActual || null;

    return (
        <div>
            <label className="text-sm text-neutral-400">Foto del platillo</label>

            <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={onDrop}
                className={`mt-1 flex items-center gap-3 border-2 border-dashed rounded-xl p-3 cursor-pointer transition-colors ${
                    arrastrando ? 'border-[#ff4d00] bg-[#ff4d00]/10' : 'border-neutral-700 hover:border-neutral-500'
                }`}
            >
                <div className="w-16 h-16 rounded-lg bg-neutral-800 overflow-hidden shrink-0 flex items-center justify-center">
                    {imagenAMostrar ? (
                        <img src={imagenAMostrar} alt="Vista previa" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-neutral-600 text-xs text-center px-1">Sin foto</span>
                    )}
                </div>
                <div className="text-sm text-neutral-300">
                    {subiendo ? (
                        <span className="text-[#ff4d00]">Subiendo…</span>
                    ) : (
                        <>
                            <span className="text-[#ff4d00] font-semibold">Haz clic</span> o arrastra una foto aquí
                            <p className="text-xs text-neutral-500">JPG, PNG o WEBP — máx. 5MB</p>
                        </>
                    )}
                </div>
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) subirArchivo(file);
                    e.target.value = ''; // permite volver a elegir el mismo archivo si hace falta
                }}
            />

            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}

            <button
                type="button"
                onClick={() => setMostrarUrlManual((v) => !v)}
                className="text-xs text-neutral-500 underline mt-2"
            >
                {mostrarUrlManual ? 'Ocultar' : 'O pegar una URL manualmente'}
            </button>

            {mostrarUrlManual && (
                <input
                    defaultValue={valorActual}
                    onBlur={(e) => onSubido(e.target.value.trim())}
                    placeholder="https://..."
                    className="w-full mt-2 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                />
            )}
        </div>
    );
}
