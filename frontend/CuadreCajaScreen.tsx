'use client';

// ============================================================================
// CuadreCajaScreen.tsx — Apertura/cierre de turno de caja (Fase 2)
//
// Nota de diseño: igual que el resto del POS, esta pantalla NO pide login de
// cajero (el sistema no tiene cuentas de cajero individuales todavía — solo
// el dueño tiene login, para /admin). Por eso el turno se identifica con un
// nombre libre que escribe quien abre caja, no con una sesión autenticada.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../sync-engine/supabaseClient';

interface Turno {
    id: string;
    cajero_nombre: string | null;
    monto_inicial: number;
    monto_final_declarado: number | null;
    total_ventas_efectivo: number | null;
    diferencia: number | null;
    estado: 'abierto' | 'cerrado';
    abierto_at: string;
    cerrado_at: string | null;
}

interface Retiro {
    id: string;
    monto: number;
    motivo: string | null;
    created_at: string;
}

const CLAVE_TURNO_LOCAL = 'marun_burger_turno_abierto_id';

export default function CuadreCajaScreen() {
    const supabase = getSupabaseBrowserClient();
    const [turno, setTurno] = useState<Turno | null>(null);
    const [retiros, setRetiros] = useState<Retiro[]>([]);
    const [ventasEfectivoEnCurso, setVentasEfectivoEnCurso] = useState(0);
    const [cargando, setCargando] = useState(true);

    const cargarRetiros = useCallback(async (turnoId: string) => {
        const { data } = await supabase
            .from('cash_register_withdrawals')
            .select('id, monto, motivo, created_at')
            .eq('cash_register_id', turnoId)
            .order('created_at', { ascending: false });
        setRetiros((data as Retiro[]) ?? []);
    }, [supabase]);

    const cargarVentasEfectivo = useCallback(async (desde: string) => {
        const { data } = await supabase
            .from('ventas')
            .select('monto_efectivo')
            .gte('created_at', desde)
            .neq('estado', 'ANULADA');
        const suma = (data ?? []).reduce(
            (acc: number, v: { monto_efectivo: number | null }) => acc + Number(v.monto_efectivo || 0),
            0
        );
        setVentasEfectivoEnCurso(suma);
    }, [supabase]);

    const cargarTurnoGuardado = useCallback(async () => {
        const idGuardado = typeof window !== 'undefined' ? localStorage.getItem(CLAVE_TURNO_LOCAL) : null;
        if (!idGuardado) {
            setCargando(false);
            return;
        }

        const { data } = await supabase.from('cash_registers').select('*').eq('id', idGuardado).single();
        if (data && data.estado === 'abierto') {
            setTurno(data as Turno);
            await cargarRetiros(data.id);
            await cargarVentasEfectivo(data.abierto_at);
        } else {
            localStorage.removeItem(CLAVE_TURNO_LOCAL);
        }
        setCargando(false);
    }, [supabase, cargarRetiros, cargarVentasEfectivo]);

    useEffect(() => {
        cargarTurnoGuardado();
    }, [cargarTurnoGuardado]);

    // Refresca las ventas en efectivo cada 15s mientras el turno está abierto
    useEffect(() => {
        if (!turno || turno.estado !== 'abierto') return;
        const intervalo = setInterval(() => cargarVentasEfectivo(turno.abierto_at), 15000);
        return () => clearInterval(intervalo);
    }, [turno, cargarVentasEfectivo]);

    async function abrirTurno(nombre: string, montoInicial: number) {
        const { data, error } = await supabase
            .from('cash_registers')
            .insert({ cajero_nombre: nombre, monto_inicial: montoInicial, estado: 'abierto' })
            .select()
            .single();

        if (error || !data) {
            alert('No se pudo abrir el turno: ' + (error?.message ?? 'error desconocido'));
            return;
        }

        localStorage.setItem(CLAVE_TURNO_LOCAL, data.id);
        setTurno(data as Turno);
        setRetiros([]);
        setVentasEfectivoEnCurso(0);
    }

    async function registrarRetiro(monto: number, motivo: string) {
        if (!turno) return;
        const { error } = await supabase
            .from('cash_register_withdrawals')
            .insert({ cash_register_id: turno.id, monto, motivo: motivo || null });
        if (error) {
            alert('No se pudo registrar el retiro: ' + error.message);
            return;
        }
        await cargarRetiros(turno.id);
    }

    async function cerrarTurno(montoFinalDeclarado: number) {
        if (!turno) return;
        const { data, error } = await supabase.rpc('cerrar_turno', {
            p_turno_id: turno.id,
            p_monto_final_declarado: montoFinalDeclarado,
        });
        if (error) {
            alert('No se pudo cerrar el turno: ' + error.message);
            return;
        }
        localStorage.removeItem(CLAVE_TURNO_LOCAL);
        setTurno(data as Turno);
    }

    if (cargando) {
        return <div className="min-h-screen bg-[#111111] text-white flex items-center justify-center">Cargando…</div>;
    }

    const totalRetiros = retiros.reduce((acc, r) => acc + Number(r.monto), 0);
    const totalProyectado = turno ? turno.monto_inicial + ventasEfectivoEnCurso - totalRetiros : 0;

    return (
        <div className="min-h-screen bg-[#111111] text-white p-4 sm:p-6 max-w-xl mx-auto">
            <header className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold">Cuadre de Caja</h1>
                <Link href="/pos" className="text-sm text-neutral-400 hover:text-white">← Volver al POS</Link>
            </header>

            {!turno || turno.estado === 'cerrado' ? (
                <>
                    {turno?.estado === 'cerrado' && <ResumenCierre turno={turno} retiros={retiros} />}
                    <FormularioAbrirTurno onAbrir={abrirTurno} />
                </>
            ) : (
                <div className="space-y-4">
                    <div className="bg-neutral-900 rounded-2xl p-4 space-y-1">
                        <p className="text-sm text-neutral-400">
                            Turno abierto por <span className="text-white font-semibold">{turno.cajero_nombre || 'Sin nombre'}</span>
                        </p>
                        <p className="text-xs text-neutral-500">
                            Desde: {new Date(turno.abierto_at).toLocaleString('es-DO')}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Metrica label="Monto inicial" valor={turno.monto_inicial} />
                        <Metrica label="Ventas en efectivo" valor={ventasEfectivoEnCurso} />
                        <Metrica label="Retiros" valor={-totalRetiros} />
                        <Metrica label="Total proyectado en caja" valor={totalProyectado} destacado />
                    </div>

                    <FormularioRetiro onRegistrar={registrarRetiro} />

                    {retiros.length > 0 && (
                        <div className="bg-neutral-900 rounded-2xl p-4">
                            <p className="text-sm font-semibold mb-2">Retiros de este turno</p>
                            <ul className="space-y-1 text-sm">
                                {retiros.map((r) => (
                                    <li key={r.id} className="flex justify-between text-neutral-300">
                                        <span>{r.motivo || 'Sin motivo'}</span>
                                        <span>RD$ {Number(r.monto).toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <FormularioCerrarTurno totalProyectado={totalProyectado} onCerrar={cerrarTurno} />
                </div>
            )}
        </div>
    );
}

function Metrica({ label, valor, destacado }: { label: string; valor: number; destacado?: boolean }) {
    return (
        <div className={`rounded-2xl p-4 ${destacado ? 'bg-[#ff4d00]/20 border border-[#ff4d00]' : 'bg-neutral-900'}`}>
            <p className="text-xs text-neutral-400">{label}</p>
            <p className={`text-xl font-bold ${destacado ? 'text-[#ff4d00]' : ''}`}>RD$ {valor.toFixed(2)}</p>
        </div>
    );
}

function FormularioAbrirTurno({ onAbrir }: { onAbrir: (nombre: string, monto: number) => Promise<void> }) {
    const [nombre, setNombre] = useState('');
    const [monto, setMonto] = useState('');
    const [enviando, setEnviando] = useState(false);

    async function enviar() {
        setEnviando(true);
        await onAbrir(nombre.trim(), parseFloat(monto) || 0);
        setEnviando(false);
    }

    return (
        <div className="bg-neutral-900 rounded-2xl p-4 space-y-3">
            <h2 className="font-bold">Abrir turno</h2>
            <div>
                <label className="text-sm text-neutral-400">Nombre del cajero</label>
                <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                />
            </div>
            <div>
                <label className="text-sm text-neutral-400">Monto inicial en caja (RD$)</label>
                <input
                    type="number"
                    inputMode="decimal"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                />
            </div>
            <button
                onClick={enviar}
                disabled={enviando || !nombre.trim()}
                className="w-full bg-[#ff4d00] font-bold py-3 rounded-xl disabled:opacity-50"
            >
                {enviando ? 'Abriendo…' : 'Abrir turno'}
            </button>
        </div>
    );
}

function FormularioRetiro({ onRegistrar }: { onRegistrar: (monto: number, motivo: string) => Promise<void> }) {
    const [monto, setMonto] = useState('');
    const [motivo, setMotivo] = useState('');
    const [enviando, setEnviando] = useState(false);

    async function enviar() {
        const valor = parseFloat(monto);
        if (isNaN(valor) || valor <= 0) return;
        setEnviando(true);
        await onRegistrar(valor, motivo.trim());
        setMonto('');
        setMotivo('');
        setEnviando(false);
    }

    return (
        <div className="bg-neutral-900 rounded-2xl p-4 space-y-3">
            <h2 className="font-bold text-sm">Registrar retiro de caja</h2>
            <div className="flex gap-2">
                <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Monto"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    className="w-28 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none"
                />
                <input
                    placeholder="Motivo (opcional)"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    className="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none"
                />
                <button
                    onClick={enviar}
                    disabled={enviando}
                    className="bg-neutral-700 font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                    Retirar
                </button>
            </div>
        </div>
    );
}

function FormularioCerrarTurno({ totalProyectado, onCerrar }: { totalProyectado: number; onCerrar: (monto: number) => Promise<void> }) {
    const [montoDeclarado, setMontoDeclarado] = useState('');
    const [confirmando, setConfirmando] = useState(false);
    const [enviando, setEnviando] = useState(false);

    async function enviar() {
        const valor = parseFloat(montoDeclarado);
        if (isNaN(valor)) return;
        setEnviando(true);
        await onCerrar(valor);
        setEnviando(false);
    }

    return (
        <div className="bg-neutral-900 rounded-2xl p-4 space-y-3 border border-neutral-700">
            <h2 className="font-bold">Cerrar turno</h2>
            <div>
                <label className="text-sm text-neutral-400">Efectivo contado físicamente (RD$)</label>
                <input
                    type="number"
                    inputMode="decimal"
                    value={montoDeclarado}
                    onChange={(e) => setMontoDeclarado(e.target.value)}
                    className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                />
            </div>
            {montoDeclarado && !isNaN(parseFloat(montoDeclarado)) && (
                <p className={`text-sm ${Math.abs(parseFloat(montoDeclarado) - totalProyectado) < 0.01 ? 'text-green-400' : 'text-yellow-400'}`}>
                    Diferencia vs. proyectado: RD$ {(parseFloat(montoDeclarado) - totalProyectado).toFixed(2)}
                </p>
            )}
            {!confirmando ? (
                <button
                    onClick={() => setConfirmando(true)}
                    disabled={!montoDeclarado}
                    className="w-full bg-red-900 text-red-200 font-bold py-3 rounded-xl disabled:opacity-50"
                >
                    Cerrar turno
                </button>
            ) : (
                <div className="space-y-2">
                    <p className="text-sm text-neutral-300">¿Confirmas el cierre? No se puede deshacer.</p>
                    <div className="flex gap-2">
                        <button onClick={() => setConfirmando(false)} className="flex-1 bg-neutral-800 py-2.5 rounded-xl text-sm">
                            Cancelar
                        </button>
                        <button
                            onClick={enviar}
                            disabled={enviando}
                            className="flex-1 bg-red-900 text-red-200 font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
                        >
                            {enviando ? 'Cerrando…' : 'Sí, cerrar'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ResumenCierre({ turno, retiros }: { turno: Turno; retiros: Retiro[] }) {
    const totalRetiros = retiros.reduce((acc, r) => acc + Number(r.monto), 0);
    return (
        <div className="bg-neutral-900 rounded-2xl p-4 mb-4 space-y-1">
            <p className="font-bold text-green-400">Último turno cerrado</p>
            <p className="text-sm text-neutral-400">Cajero: {turno.cajero_nombre || '—'}</p>
            <p className="text-sm text-neutral-400">Ventas en efectivo: RD$ {Number(turno.total_ventas_efectivo ?? 0).toFixed(2)}</p>
            {retiros.length > 0 && (
                <p className="text-sm text-neutral-400">
                    Retiros: {retiros.length} (RD$ {totalRetiros.toFixed(2)})
                </p>
            )}
            <p className="text-sm text-neutral-400">Declarado al cerrar: RD$ {Number(turno.monto_final_declarado ?? 0).toFixed(2)}</p>
            <p className={`text-sm font-semibold ${Math.abs(Number(turno.diferencia ?? 0)) < 0.01 ? 'text-green-400' : 'text-yellow-400'}`}>
                Diferencia: RD$ {Number(turno.diferencia ?? 0).toFixed(2)}
            </p>
        </div>
    );
}
