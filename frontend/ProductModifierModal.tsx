'use client';

// ============================================================================
// ProductModifierModal.tsx — Modificadores de producto / Notas de cocina
//
// Componente NUEVO, independiente. No modifica el precio del ítem bajo
// ninguna circunstancia — es puramente informativo para la cocina.
// Se abre desde el botón "+ Nota" de una línea del carrito en POSScreen.tsx.
// ============================================================================

import { useState } from 'react';

const TAGS_RAPIDOS = ['Sin Queso', 'Sin Cebolla', 'Sin Salsas', 'Poca Sal', 'Sin Lechuga', 'Sin Tomate', 'Para llevar', 'Bien cocido'];

export default function ProductModifierModal({
    nombreProducto,
    notaInicial,
    onGuardar,
    onCerrar,
}: {
    nombreProducto: string;
    notaInicial: string;
    onGuardar: (nota: string) => void;
    onCerrar: () => void;
}) {
    const [nota, setNota] = useState(notaInicial);

    function agregarTag(tag: string) {
        setNota((actual) => {
            if (actual.trim() === '') return tag;
            // Evita agregar el mismo tag dos veces
            if (actual.split(',').map((s) => s.trim()).includes(tag)) return actual;
            return `${actual.trim()}, ${tag}`;
        });
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-neutral-900 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 w-full sm:w-[420px] text-white space-y-4">
                <div>
                    <h3 className="text-lg font-bold">Nota para cocina</h3>
                    <p className="text-sm text-neutral-400">{nombreProducto}</p>
                </div>

                <div>
                    <label className="text-sm text-neutral-400">Opciones rápidas</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        {TAGS_RAPIDOS.map((tag) => (
                            <button
                                key={tag}
                                onClick={() => agregarTag(tag)}
                                className="bg-neutral-800 hover:bg-neutral-700 text-sm py-2 rounded-lg"
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="text-sm text-neutral-400">Nota libre</label>
                    <textarea
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        rows={3}
                        placeholder="Ej. sin cebolla, extra bien cocida..."
                        className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00] resize-none"
                    />
                </div>

                <p className="text-xs text-neutral-500">
                    El precio del producto no cambia por estas notas — son solo
                    instrucciones para la cocina.
                </p>

                <div className="flex gap-3 pt-1">
                    <button onClick={onCerrar} className="flex-1 py-3 rounded-xl bg-neutral-800 font-semibold text-sm">
                        Cancelar
                    </button>
                    <button
                        onClick={() => onGuardar(nota.trim())}
                        className="flex-1 py-3 rounded-xl bg-[#ff4d00] font-bold text-sm"
                    >
                        Guardar nota
                    </button>
                </div>
            </div>
        </div>
    );
}
