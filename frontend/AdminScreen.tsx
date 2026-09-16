'use client';

// ============================================================================
// AdminScreen.tsx — Panel de administración del dueño (Módulo C)
// - Login con Supabase Auth, verificando rol = 'owner'
// - Ventas de hoy en vivo (Supabase Realtime)
// - Inventario de insumos (con alerta de stock bajo) y edición rápida
// - Rentabilidad por producto (costo de receta vs. precio de venta)
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { getSupabaseBrowserClient } from '../sync-engine/supabaseClient';
import SubidaImagenProducto from './SubidaImagenProducto';

type Tab = 'ventas' | 'menu' | 'inventario' | 'rentabilidad';

interface InsumoRow {
    id: string;
    nombre: string;
    unidad: string;
    stock_actual: number;
    stock_minimo: number;
    costo_unitario: number;
}

interface RentabilidadRow {
    producto_id: string;
    producto: string;
    precio_venta: number;
    costo_produccion: number;
    margen: number;
    margen_pct: number;
}

interface VentaRow {
    id: string;
    numero_orden: number;
    total: number;
    metodo_pago: string;
    estado: string;
    cajero_id: string | null;
    created_at: string;
}

export default function AdminScreen() {
    const supabase = getSupabaseBrowserClient();
    const [cargandoSesion, setCargandoSesion] = useState(true);
    const [esOwner, setEsOwner] = useState(false);
    const [tab, setTab] = useState<Tab>('ventas');

    useEffect(() => {
        async function verificarSesion() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setCargandoSesion(false);
                return;
            }
            const { data: perfil } = await supabase
                .from('usuarios_app')
                .select('rol')
                .eq('id', session.user.id)
                .single();
            setEsOwner(perfil?.rol === 'owner');
            setCargandoSesion(false);
        }
        verificarSesion();

        const { data: listener } = supabase.auth.onAuthStateChange(() => verificarSesion());
        return () => listener.subscription.unsubscribe();
    }, [supabase]);

    if (cargandoSesion) {
        return <div className="min-h-screen bg-[#111111] text-white flex items-center justify-center">Cargando…</div>;
    }

    if (!esOwner) {
        return <LoginOwner onLoginExitoso={() => setEsOwner(true)} />;
    }

    return (
        <div className="min-h-screen bg-[#111111] text-white">
            <header className="flex items-center justify-between p-4 border-b border-neutral-800">
                <h1 className="text-xl font-bold">Marun Burger — Panel del Dueño</h1>
                <button
                    onClick={() => supabase.auth.signOut()}
                    className="text-sm text-neutral-400 hover:text-white"
                >
                    Cerrar sesión
                </button>
            </header>

            <nav className="flex gap-2 p-4 overflow-x-auto">
                {([
                    ['ventas', 'Ventas de hoy'],
                    ['menu', 'Menú'],
                    ['inventario', 'Inventario'],
                    ['rentabilidad', 'Rentabilidad'],
                ] as [Tab, string][]).map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${
                            tab === id ? 'bg-[#ff4d00]' : 'bg-neutral-800 text-neutral-300'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </nav>

            <main className="p-4">
                {tab === 'ventas' && <PanelVentasHoy />}
                {tab === 'menu' && <PanelMenu />}
                {tab === 'inventario' && <PanelInventario />}
                {tab === 'rentabilidad' && <PanelRentabilidad />}
            </main>
        </div>
    );
}

// ============================================================================
// Login del dueño
// ============================================================================

function LoginOwner({ onLoginExitoso }: { onLoginExitoso: () => void }) {
    const supabase = getSupabaseBrowserClient();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(false);

    async function iniciarSesion() {
        setError(null);
        setCargando(true);
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

        if (authError || !data.session) {
            setError('Correo o contraseña incorrectos.');
            setCargando(false);
            return;
        }

        const { data: perfil } = await supabase
            .from('usuarios_app')
            .select('rol')
            .eq('id', data.session.user.id)
            .single();

        if (perfil?.rol !== 'owner') {
            setError('Esta cuenta no tiene permisos de dueño.');
            await supabase.auth.signOut();
            setCargando(false);
            return;
        }

        setCargando(false);
        onLoginExitoso();
    }

    return (
        <div className="min-h-screen bg-[#111111] text-white flex items-center justify-center p-4">
            <div className="bg-neutral-900 rounded-2xl p-6 w-full max-w-sm space-y-4">
                <h1 className="text-xl font-bold text-center">Marun Burger — Acceso del Dueño</h1>
                <div>
                    <label className="text-sm text-neutral-400">Correo</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                    />
                </div>
                <div>
                    <label className="text-sm text-neutral-400">Contraseña</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && iniciarSesion()}
                        className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                    />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button
                    onClick={iniciarSesion}
                    disabled={cargando}
                    className="w-full bg-[#ff4d00] font-bold py-3 rounded-xl disabled:opacity-50"
                >
                    {cargando ? 'Entrando…' : 'Entrar'}
                </button>
            </div>
        </div>
    );
}

// ============================================================================
// Ventas de hoy — en vivo vía Supabase Realtime
// ============================================================================

type RangoFecha = 'hoy' | 'ayer' | 'semana' | 'mes';

// República Dominicana usa AST (UTC-4) todo el año, sin horario de verano.
// Estas funciones calculan "hoy/ayer/semana/mes" en esa zona horaria fija,
// en vez de confiar en la configuración de reloj del dispositivo del dueño
// (que podría estar mal puesta, o en otro huso horario si viaja).
const AST_OFFSET_MS = 4 * 60 * 60 * 1000;

/** Medianoche (00:00) en AST del día que contiene `instanteUTC`, como instante UTC real. */
function medianocheASTDe(instanteUTC: Date): Date {
    const wallAST = new Date(instanteUTC.getTime() - AST_OFFSET_MS);
    const medianocheWallAST = Date.UTC(wallAST.getUTCFullYear(), wallAST.getUTCMonth(), wallAST.getUTCDate(), 0, 0, 0);
    return new Date(medianocheWallAST + AST_OFFSET_MS);
}

function calcularRangoFecha(rango: RangoFecha): { desde: Date; hasta: Date } {
    const ahora = new Date();
    const hoyInicio = medianocheASTDe(ahora);

    if (rango === 'hoy') {
        return { desde: hoyInicio, hasta: ahora };
    }
    if (rango === 'ayer') {
        const ayerInicio = new Date(hoyInicio.getTime() - 24 * 60 * 60 * 1000);
        return { desde: ayerInicio, hasta: hoyInicio };
    }
    if (rango === 'semana') {
        // Día de la semana en AST (0 = domingo), calculado sobre el reloj de
        // pared AST, no sobre el huso horario del dispositivo.
        const wallAST = new Date(ahora.getTime() - AST_OFFSET_MS);
        const diaSemana = wallAST.getUTCDay();
        const offsetDias = diaSemana === 0 ? 6 : diaSemana - 1; // semana empieza lunes
        const inicioSemana = new Date(hoyInicio.getTime() - offsetDias * 24 * 60 * 60 * 1000);
        return { desde: inicioSemana, hasta: ahora };
    }
    // mes
    const wallAST = new Date(ahora.getTime() - AST_OFFSET_MS);
    const inicioMesWallAST = Date.UTC(wallAST.getUTCFullYear(), wallAST.getUTCMonth(), 1, 0, 0, 0);
    const inicioMes = new Date(inicioMesWallAST + AST_OFFSET_MS);
    return { desde: inicioMes, hasta: ahora };
}

function PanelVentasHoy() {
    const supabase = getSupabaseBrowserClient();
    const [ventas, setVentas] = useState<VentaRow[]>([]);
    const [cargando, setCargando] = useState(true);
    const [rango, setRango] = useState<RangoFecha>('hoy');
    const [ventaSeleccionada, setVentaSeleccionada] = useState<VentaRow | null>(null);

    const cargarVentas = useCallback(async () => {
        const { desde, hasta } = calcularRangoFecha(rango);

        const { data } = await supabase
            .from('ventas')
            .select('id, numero_orden, total, metodo_pago, estado, cajero_id, created_at')
            .gte('created_at', desde.toISOString())
            .lte('created_at', hasta.toISOString())
            .order('created_at', { ascending: false });

        setVentas((data as VentaRow[]) ?? []);
        setCargando(false);
    }, [supabase, rango]);

    useEffect(() => {
        cargarVentas();

        const canal = supabase
            .channel('ventas-en-vivo')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => {
                cargarVentas();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(canal);
        };
    }, [supabase, cargarVentas]);

    const ventasValidas = ventas.filter((v) => v.estado !== 'ANULADA');
    const totalPeriodo = ventasValidas.reduce((acc, v) => acc + Number(v.total), 0);

    const etiquetaRango: Record<RangoFecha, string> = {
        hoy: 'Hoy',
        ayer: 'Ayer',
        semana: 'Esta semana',
        mes: 'Este mes',
    };

    if (cargando) return <p className="text-neutral-400">Cargando ventas…</p>;

    return (
        <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto">
                {(['hoy', 'ayer', 'semana', 'mes'] as RangoFecha[]).map((r) => (
                    <button
                        key={r}
                        onClick={() => { setCargando(true); setRango(r); }}
                        className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${
                            rango === r ? 'bg-[#ff4d00]' : 'bg-neutral-800 text-neutral-300'
                        }`}
                    >
                        {etiquetaRango[r]}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-900 rounded-2xl p-4">
                    <p className="text-neutral-400 text-sm">Total vendido — {etiquetaRango[rango]}</p>
                    <p className="text-3xl font-bold text-[#ff4d00]">RD$ {totalPeriodo.toFixed(2)}</p>
                </div>
                <div className="bg-neutral-900 rounded-2xl p-4">
                    <p className="text-neutral-400 text-sm">Órdenes ({etiquetaRango[rango].toLowerCase()})</p>
                    <p className="text-3xl font-bold">{ventasValidas.length}</p>
                </div>
            </div>

            <div className="bg-neutral-900 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-800 text-neutral-400">
                        <tr>
                            <th className="text-left p-3">Orden</th>
                            <th className="text-left p-3">Fecha/Hora</th>
                            <th className="text-left p-3">Pago</th>
                            <th className="text-center p-3">Estado</th>
                            <th className="text-right p-3">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ventas.map((v) => (
                            <tr
                                key={v.id}
                                onClick={() => setVentaSeleccionada(v)}
                                className="border-t border-neutral-800 cursor-pointer hover:bg-neutral-800/50"
                            >
                                <td className="p-3">#{v.numero_orden}</td>
                                <td className="p-3">{new Date(v.created_at).toLocaleString('es-DO')}</td>
                                <td className="p-3">{v.metodo_pago}</td>
                                <td className="p-3 text-center"><BadgeEstado estado={v.estado} /></td>
                                <td className="p-3 text-right">RD$ {Number(v.total).toFixed(2)}</td>
                            </tr>
                        ))}
                        {ventas.length === 0 && (
                            <tr><td colSpan={5} className="p-6 text-center text-neutral-500">Sin ventas en este período.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {ventaSeleccionada && (
                <ModalDetalleVenta
                    venta={ventaSeleccionada}
                    onCerrar={() => setVentaSeleccionada(null)}
                    onAnulada={() => { setVentaSeleccionada(null); cargarVentas(); }}
                />
            )}
        </div>
    );
}

function BadgeEstado({ estado }: { estado: string }) {
    const config: Record<string, { label: string; clase: string }> = {
        COMPLETADA: { label: 'Pagada', clase: 'bg-green-900 text-green-300' },
        PENDIENTE: { label: 'Pendiente', clase: 'bg-yellow-900 text-yellow-300' },
        ANULADA: { label: 'Anulada', clase: 'bg-red-900 text-red-300' },
    };
    const c = config[estado] ?? { label: estado, clase: 'bg-neutral-700 text-neutral-300' };
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${c.clase}`}>{c.label}</span>;
}

// ============================================================================
// Detalle de orden — slide-over con los platillos, cajero, notas y el botón
// para anular (devuelve automáticamente los insumos al inventario).
// ============================================================================

interface DetalleItem {
    id: string;
    cantidad: number;
    precio_unitario: number;
    notas: string | null;
    productos: { nombre: string } | null;
}

function ModalDetalleVenta({
    venta,
    onCerrar,
    onAnulada,
}: {
    venta: VentaRow;
    onCerrar: () => void;
    onAnulada: () => void;
}) {
    const supabase = getSupabaseBrowserClient();
    const [items, setItems] = useState<DetalleItem[]>([]);
    const [nombreCajero, setNombreCajero] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);
    const [anulando, setAnulando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function cargar() {
            const { data: detalle } = await supabase
                .from('detalle_ventas')
                .select('id, cantidad, precio_unitario, notas, productos(nombre)')
                .eq('venta_id', venta.id);
            setItems((detalle as unknown as DetalleItem[]) ?? []);

            if (venta.cajero_id) {
                const { data: cajero } = await supabase
                    .from('usuarios_app')
                    .select('nombre')
                    .eq('id', venta.cajero_id)
                    .single();
                setNombreCajero(cajero?.nombre ?? null);
            }
            setCargando(false);
        }
        cargar();
    }, [supabase, venta.id, venta.cajero_id]);

    async function anular() {
        if (!confirm('¿Anular esta orden? Esto devuelve automáticamente los insumos al inventario y no se puede deshacer.')) return;
        setAnulando(true);
        setError(null);
        const { error: err } = await supabase.rpc('anular_venta', { p_venta_id: venta.id });
        setAnulando(false);
        if (err) {
            setError('No se pudo anular: ' + err.message);
            return;
        }
        onAnulada();
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-end z-50">
            <div className="bg-neutral-900 h-full w-full sm:w-[420px] p-5 space-y-4 overflow-y-auto">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg">Orden #{venta.numero_orden}</h3>
                    <button onClick={onCerrar} className="text-neutral-400 text-sm">Cerrar</button>
                </div>

                <div className="flex items-center gap-2">
                    <BadgeEstado estado={venta.estado} />
                    <span className="text-neutral-400 text-sm">{new Date(venta.created_at).toLocaleString('es-DO')}</span>
                </div>

                <p className="text-sm text-neutral-400">
                    Cajero: <span className="text-white">{nombreCajero ?? 'No registrado (venta desde POS sin login)'}</span>
                </p>
                <p className="text-sm text-neutral-400">
                    Método de pago: <span className="text-white">{venta.metodo_pago}</span>
                </p>

                {cargando ? (
                    <p className="text-neutral-400 text-sm">Cargando detalle…</p>
                ) : (
                    <div className="space-y-2">
                        {items.map((it) => (
                            <div key={it.id} className="bg-neutral-800 rounded-lg px-3 py-2 text-sm">
                                <div className="flex justify-between">
                                    <span>{it.cantidad}x {it.productos?.nombre ?? 'Producto'}</span>
                                    <span>RD$ {(it.cantidad * it.precio_unitario).toFixed(2)}</span>
                                </div>
                                {it.notas && <p className="text-xs text-neutral-500 mt-1">Nota: {it.notas}</p>}
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex justify-between font-bold text-lg pt-3 border-t border-neutral-700">
                    <span>Total</span>
                    <span>RD$ {Number(venta.total).toFixed(2)}</span>
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                {venta.estado !== 'ANULADA' && (
                    <button
                        onClick={anular}
                        disabled={anulando}
                        className="w-full bg-red-900 text-red-200 font-bold py-3 rounded-xl disabled:opacity-50"
                    >
                        {anulando ? 'Anulando…' : 'Anular orden (devuelve inventario)'}
                    </button>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Inventario de insumos — con edición rápida de stock/costo
// ============================================================================

interface MovimientoInventario {
    id: string;
    tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    cantidad: number;
    motivo: string | null;
    created_at: string;
}

function PanelInventario() {
    const supabase = getSupabaseBrowserClient();
    const [insumos, setInsumos] = useState<InsumoRow[]>([]);
    const [cargando, setCargando] = useState(true);
    const [guardandoId, setGuardandoId] = useState<string | null>(null);
    const [insumoKardexId, setInsumoKardexId] = useState<string | null>(null);

    // Formulario "Agregar nuevo insumo"
    const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
    const [nombreNuevo, setNombreNuevo] = useState('');
    const [unidadNueva, setUnidadNueva] = useState('UND');
    const [stockInicial, setStockInicial] = useState('');
    const [stockMinimoNuevo, setStockMinimoNuevo] = useState('');
    const [costoNuevo, setCostoNuevo] = useState('');
    const [errorNuevo, setErrorNuevo] = useState<string | null>(null);
    const [guardandoNuevo, setGuardandoNuevo] = useState(false);

    const cargarInsumos = useCallback(async () => {
        const { data } = await supabase
            .from('insumos')
            .select('id, nombre, unidad, stock_actual, stock_minimo, costo_unitario')
            .order('nombre');
        setInsumos((data as InsumoRow[]) ?? []);
        setCargando(false);
    }, [supabase]);

    useEffect(() => {
        cargarInsumos();
    }, [cargarInsumos]);

    async function ajustarStock(id: string, valorAnterior: number, valorNuevo: number) {
        const delta = valorNuevo - valorAnterior;
        if (delta === 0) return;
        setGuardandoId(id);
        await supabase.rpc('ajustar_stock_insumo', {
            p_insumo_id: id,
            p_cantidad: delta,
            p_tipo: 'AJUSTE',
            p_motivo: 'Ajuste manual desde panel',
        });
        await cargarInsumos();
        setGuardandoId(null);
    }

    async function actualizarCosto(id: string, valor: number) {
        setGuardandoId(id);
        await supabase.from('insumos').update({ costo_unitario: valor }).eq('id', id);
        await cargarInsumos();
        setGuardandoId(null);
    }

    async function crearInsumo() {
        setErrorNuevo(null);
        if (!nombreNuevo.trim()) {
            setErrorNuevo('Escribe el nombre del insumo.');
            return;
        }
        const stock = parseFloat(stockInicial) || 0;
        const minimo = parseFloat(stockMinimoNuevo) || 0;
        const costo = parseFloat(costoNuevo) || 0;

        setGuardandoNuevo(true);
        const { error } = await supabase.from('insumos').insert({
            nombre: nombreNuevo.trim(),
            unidad: unidadNueva,
            stock_actual: stock,
            stock_minimo: minimo,
            costo_unitario: costo,
        });

        if (error) {
            setErrorNuevo('No se pudo guardar: ' + error.message);
            setGuardandoNuevo(false);
            return;
        }

        setNombreNuevo('');
        setUnidadNueva('UND');
        setStockInicial('');
        setStockMinimoNuevo('');
        setCostoNuevo('');
        setGuardandoNuevo(false);
        setMostrarFormNuevo(false);
        await cargarInsumos();
    }

    if (cargando) return <p className="text-neutral-400">Cargando inventario…</p>;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="font-bold text-lg">Inventario de insumos</h2>
                <button
                    onClick={() => setMostrarFormNuevo((v) => !v)}
                    className="bg-[#ff4d00] font-bold px-4 py-2 rounded-xl text-sm"
                >
                    {mostrarFormNuevo ? 'Cancelar' : '+ Agregar insumo'}
                </button>
            </div>

            {mostrarFormNuevo && (
                <div className="bg-neutral-900 rounded-2xl p-4 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <div className="col-span-2 sm:col-span-1">
                            <label className="text-xs text-neutral-400">Nombre</label>
                            <input
                                value={nombreNuevo}
                                onChange={(e) => setNombreNuevo(e.target.value)}
                                placeholder="Ej. Queso Cheddar"
                                className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-neutral-400">Unidad</label>
                            <select
                                value={unidadNueva}
                                onChange={(e) => setUnidadNueva(e.target.value)}
                                className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none"
                            >
                                {['LBS', 'ONZ', 'UND', 'ML', 'LT', 'GR', 'KG'].map((u) => (
                                    <option key={u} value={u}>{u}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-neutral-400">Stock inicial</label>
                            <input
                                type="number"
                                value={stockInicial}
                                onChange={(e) => setStockInicial(e.target.value)}
                                className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-neutral-400">Stock mínimo</label>
                            <input
                                type="number"
                                value={stockMinimoNuevo}
                                onChange={(e) => setStockMinimoNuevo(e.target.value)}
                                className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-neutral-400">Costo unitario (RD$)</label>
                            <input
                                type="number"
                                value={costoNuevo}
                                onChange={(e) => setCostoNuevo(e.target.value)}
                                className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none"
                            />
                        </div>
                    </div>
                    {errorNuevo && <p className="text-red-400 text-sm">{errorNuevo}</p>}
                    <button
                        onClick={crearInsumo}
                        disabled={guardandoNuevo}
                        className="bg-[#ff4d00] font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-50"
                    >
                        {guardandoNuevo ? 'Guardando…' : 'Guardar insumo'}
                    </button>
                </div>
            )}

            <div className="bg-neutral-900 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-800 text-neutral-400">
                        <tr>
                            <th className="text-left p-3">Insumo</th>
                            <th className="text-left p-3">Unidad</th>
                            <th className="text-right p-3">Stock actual</th>
                            <th className="text-right p-3">Stock mínimo</th>
                            <th className="text-right p-3">Costo unitario</th>
                            <th className="text-center p-3">Kardex</th>
                        </tr>
                    </thead>
                    <tbody>
                        {insumos.map((ins) => {
                            // 3 niveles: rojo (en o bajo el mínimo), amarillo (cerca, hasta 20% arriba), normal
                            const stockCritico = ins.stock_actual <= ins.stock_minimo;
                            const stockAlerta = !stockCritico && ins.stock_actual <= ins.stock_minimo * 1.2;
                            const filaClase = stockCritico ? 'bg-red-950/30' : stockAlerta ? 'bg-yellow-950/20' : '';
                            return (
                                <tr key={ins.id} className={`border-t border-neutral-800 ${filaClase}`}>
                                    <td className="p-3">
                                        {ins.nombre}
                                        {stockCritico && <span className="ml-2 text-red-400 text-xs">● Stock bajo</span>}
                                        {stockAlerta && <span className="ml-2 text-yellow-400 text-xs">● Por agotarse</span>}
                                    </td>
                                    <td className="p-3">{ins.unidad}</td>
                                    <td className="p-3 text-right">
                                        <input
                                            type="number"
                                            defaultValue={ins.stock_actual}
                                            onBlur={(e) => ajustarStock(ins.id, ins.stock_actual, parseFloat(e.target.value) || 0)}
                                            className="w-24 bg-neutral-800 rounded px-2 py-1 text-right outline-none focus:ring-2 focus:ring-[#ff4d00]"
                                        />
                                    </td>
                                    <td className="p-3 text-right text-neutral-400">{ins.stock_minimo}</td>
                                    <td className="p-3 text-right">
                                        <input
                                            type="number"
                                            defaultValue={ins.costo_unitario}
                                            onBlur={(e) => actualizarCosto(ins.id, parseFloat(e.target.value) || 0)}
                                            className="w-24 bg-neutral-800 rounded px-2 py-1 text-right outline-none focus:ring-2 focus:ring-[#ff4d00]"
                                        />
                                        {guardandoId === ins.id && <span className="ml-2 text-xs text-neutral-500">guardando…</span>}
                                    </td>
                                    <td className="p-3 text-center">
                                        <button
                                            onClick={() => setInsumoKardexId(ins.id)}
                                            className="text-[#ff4d00] text-xs font-semibold underline"
                                        >
                                            Ver historial
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {insumos.length === 0 && (
                            <tr><td colSpan={6} className="p-6 text-center text-neutral-500">No hay insumos registrados.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {insumoKardexId && (
                <ModalKardex
                    insumoId={insumoKardexId}
                    nombreInsumo={insumos.find((i) => i.id === insumoKardexId)?.nombre ?? ''}
                    onCerrar={() => setInsumoKardexId(null)}
                />
            )}
        </div>
    );
}

// ============================================================================
// Kardex — historial de movimientos de un insumo (entradas/salidas/ajustes)
// ============================================================================

function ModalKardex({ insumoId, nombreInsumo, onCerrar }: { insumoId: string; nombreInsumo: string; onCerrar: () => void }) {
    const supabase = getSupabaseBrowserClient();
    const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([]);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        supabase
            .from('inventory_movements')
            .select('id, tipo, cantidad, motivo, created_at')
            .eq('insumo_id', insumoId)
            .order('created_at', { ascending: false })
            .limit(100)
            .then(({ data }) => {
                setMovimientos((data as MovimientoInventario[]) ?? []);
                setCargando(false);
            });
    }, [supabase, insumoId]);

    const colorTipo: Record<string, string> = {
        ENTRADA: 'text-green-400',
        SALIDA: 'text-red-400',
        AJUSTE: 'text-yellow-400',
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 rounded-2xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-3">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg">Kardex — {nombreInsumo}</h3>
                    <button onClick={onCerrar} className="text-neutral-400 text-sm">Cerrar</button>
                </div>

                {cargando ? (
                    <p className="text-neutral-400 text-sm">Cargando…</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="text-neutral-500">
                            <tr>
                                <th className="text-left py-1">Fecha</th>
                                <th className="text-left py-1">Tipo</th>
                                <th className="text-right py-1">Cantidad</th>
                                <th className="text-left py-1">Motivo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {movimientos.map((m) => (
                                <tr key={m.id} className="border-t border-neutral-800">
                                    <td className="py-2">{new Date(m.created_at).toLocaleString('es-DO')}</td>
                                    <td className={`py-2 font-semibold ${colorTipo[m.tipo]}`}>{m.tipo}</td>
                                    <td className="py-2 text-right">{m.cantidad}</td>
                                    <td className="py-2 text-neutral-400">{m.motivo ?? '—'}</td>
                                </tr>
                            ))}
                            {movimientos.length === 0 && (
                                <tr><td colSpan={4} className="py-6 text-center text-neutral-500">Sin movimientos registrados todavía.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Menú — crear, editar, ocultar y armar la receta de platillos
// ============================================================================

interface CategoriaOption {
    id: string;
    nombre: string;
}

interface ProductoMenuRow {
    id: string;
    nombre: string;
    precio: number;
    agotado: boolean;
    activo: boolean;
    imagen_url: string | null;
    categoria_id: string | null;
    categorias: { nombre: string } | null;
}

interface InsumoOption {
    id: string;
    nombre: string;
    unidad: string;
}

interface RecetaItem {
    id: string;
    insumo_id: string;
    cantidad_requerida: number;
    insumos: { nombre: string; unidad: string } | null;
}

function PanelMenu() {
    const supabase = getSupabaseBrowserClient();
    const [categorias, setCategorias] = useState<CategoriaOption[]>([]);
    const [productos, setProductos] = useState<ProductoMenuRow[]>([]);
    const [insumos, setInsumos] = useState<InsumoOption[]>([]);
    const [cargando, setCargando] = useState(true);
    const [productoRecetaId, setProductoRecetaId] = useState<string | null>(null);
    const [productoEditandoId, setProductoEditandoId] = useState<string | null>(null);

    // Formulario de nuevo platillo (Fase 1: sin ITBIS — el negocio no lo usa)
    const [nombreNuevo, setNombreNuevo] = useState('');
    const [categoriaNuevo, setCategoriaNuevo] = useState('');
    const [precioNuevo, setPrecioNuevo] = useState('');
    const [imagenNuevo, setImagenNuevo] = useState('');
    const [errorForm, setErrorForm] = useState<string | null>(null);
    const [guardandoNuevo, setGuardandoNuevo] = useState(false);

    const cargarTodo = useCallback(async () => {
        const [{ data: cats }, { data: prods }, { data: ins }] = await Promise.all([
            supabase.from('categorias').select('id, nombre').order('orden'),
            supabase
                .from('productos')
                .select('id, nombre, precio, agotado, activo, imagen_url, categoria_id, categorias(nombre)')
                .order('nombre'),
            supabase.from('insumos').select('id, nombre, unidad').order('nombre'),
        ]);
        setCategorias((cats as CategoriaOption[]) ?? []);
        setProductos((prods as unknown as ProductoMenuRow[]) ?? []);
        setInsumos((ins as InsumoOption[]) ?? []);
        setCargando(false);
    }, [supabase]);

    useEffect(() => {
        cargarTodo();
    }, [cargarTodo]);

    async function crearPlatillo() {
        setErrorForm(null);

        if (!nombreNuevo.trim()) {
            setErrorForm('Escribe el nombre del platillo.');
            return;
        }
        if (!categoriaNuevo) {
            setErrorForm('Elige una categoría.');
            return;
        }
        const precio = parseFloat(precioNuevo);
        if (isNaN(precio) || precio <= 0) {
            setErrorForm('Escribe un precio válido, mayor a 0.');
            return;
        }

        setGuardandoNuevo(true);
        // Fase 1: tax_rate siempre 0 al crear (arquitectura de impuesto "dormida")
        const { error } = await supabase.from('productos').insert({
            nombre: nombreNuevo.trim(),
            categoria_id: categoriaNuevo,
            precio,
            tax_rate: 0,
            imagen_url: imagenNuevo.trim() || null,
            activo: true,
            agotado: false,
        });

        if (error) {
            setErrorForm('No se pudo guardar: ' + error.message);
            setGuardandoNuevo(false);
            return;
        }

        setNombreNuevo('');
        setCategoriaNuevo('');
        setPrecioNuevo('');
        setImagenNuevo('');
        setGuardandoNuevo(false);
        await cargarTodo();
    }

    async function alternarActivo(id: string, activoActual: boolean) {
        await supabase.from('productos').update({ activo: !activoActual }).eq('id', id);
        await cargarTodo();
    }

    async function alternarAgotado(id: string, agotadoActual: boolean) {
        await supabase.from('productos').update({ agotado: !agotadoActual }).eq('id', id);
        await cargarTodo();
    }

    async function eliminarProducto(id: string) {
        if (!confirm('¿Eliminar este platillo? Si ya tiene ventas registradas, no se podrá borrar — en ese caso usa "Ocultar" en su lugar.')) return;
        const { error } = await supabase.from('productos').delete().eq('id', id);
        if (error) {
            alert('No se pudo eliminar (probablemente ya tiene ventas asociadas). Usa "Ocultar" en su lugar.');
            return;
        }
        await cargarTodo();
    }

    if (cargando) return <p className="text-neutral-400">Cargando menú…</p>;

    return (
        <div className="space-y-6">
            {/* Formulario de nuevo platillo */}
            <div className="bg-neutral-900 rounded-2xl p-4 space-y-3">
                <h2 className="font-bold text-lg">Agregar nuevo platillo</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="text-sm text-neutral-400">Nombre</label>
                        <input
                            value={nombreNuevo}
                            onChange={(e) => setNombreNuevo(e.target.value)}
                            placeholder="Ej. Crusándwich"
                            className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-neutral-400">Categoría</label>
                        <select
                            value={categoriaNuevo}
                            onChange={(e) => setCategoriaNuevo(e.target.value)}
                            className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                        >
                            <option value="">Elige una categoría…</option>
                            {categorias.map((c) => (
                                <option key={c.id} value={c.id}>{c.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-neutral-400">Precio (RD$)</label>
                        <input
                            type="number"
                            value={precioNuevo}
                            onChange={(e) => setPrecioNuevo(e.target.value)}
                            placeholder="Ej. 350"
                            className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                        />
                    </div>
                    <div>
                        <SubidaImagenProducto valorActual={imagenNuevo} onSubido={setImagenNuevo} />
                    </div>
                </div>
                {errorForm && <p className="text-red-400 text-sm">{errorForm}</p>}
                <button
                    onClick={crearPlatillo}
                    disabled={guardandoNuevo}
                    className="bg-[#ff4d00] font-bold px-5 py-2.5 rounded-xl disabled:opacity-50"
                >
                    {guardandoNuevo ? 'Guardando…' : '+ Agregar platillo'}
                </button>
                <p className="text-xs text-neutral-500">
                    En cuanto lo agregues, ya aparece disponible para vender en el POS
                    (con la próxima sincronización, en máximo 15 segundos).
                </p>
            </div>

            {/* Lista de platillos existentes */}
            <div className="bg-neutral-900 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-800 text-neutral-400">
                        <tr>
                            <th className="text-left p-3">Platillo</th>
                            <th className="text-left p-3">Categoría</th>
                            <th className="text-right p-3">Precio</th>
                            <th className="text-center p-3">Visible</th>
                            <th className="text-center p-3">Agotado</th>
                            <th className="text-center p-3">Receta</th>
                            <th className="text-center p-3">Editar</th>
                            <th className="text-center p-3">Eliminar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {productos.map((p) => (
                            <tr key={p.id} className={`border-t border-neutral-800 ${!p.activo ? 'opacity-50' : ''}`}>
                                <td className="p-3">{p.nombre}</td>
                                <td className="p-3 text-neutral-400">{p.categorias?.nombre ?? '—'}</td>
                                <td className="p-3 text-right">RD$ {Number(p.precio).toFixed(2)}</td>
                                <td className="p-3 text-center">
                                    <button
                                        onClick={() => alternarActivo(p.id, p.activo)}
                                        className={`px-3 py-1 rounded-full text-xs font-semibold ${p.activo ? 'bg-green-900 text-green-300' : 'bg-neutral-700 text-neutral-400'}`}
                                    >
                                        {p.activo ? 'Visible' : 'Oculto'}
                                    </button>
                                </td>
                                <td className="p-3 text-center">
                                    <button
                                        onClick={() => alternarAgotado(p.id, p.agotado)}
                                        className={`px-3 py-1 rounded-full text-xs font-semibold ${p.agotado ? 'bg-red-900 text-red-300' : 'bg-neutral-700 text-neutral-400'}`}
                                    >
                                        {p.agotado ? 'Agotado' : 'Disponible'}
                                    </button>
                                </td>
                                <td className="p-3 text-center">
                                    <button
                                        onClick={() => setProductoRecetaId(productoRecetaId === p.id ? null : p.id)}
                                        className="text-[#ff4d00] text-xs font-semibold underline"
                                    >
                                        {productoRecetaId === p.id ? 'Cerrar' : 'Ver receta'}
                                    </button>
                                </td>
                                <td className="p-3 text-center">
                                    <button
                                        onClick={() => setProductoEditandoId(p.id)}
                                        className="text-neutral-300 text-xs font-semibold underline"
                                    >
                                        Editar
                                    </button>
                                </td>
                                <td className="p-3 text-center">
                                    <button onClick={() => eliminarProducto(p.id)} className="text-red-400 text-xs">
                                        Eliminar
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {productos.length === 0 && (
                            <tr><td colSpan={8} className="p-6 text-center text-neutral-500">Todavía no hay platillos.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {productoRecetaId && (
                <EditorReceta
                    productoId={productoRecetaId}
                    insumos={insumos}
                    onCerrar={() => setProductoRecetaId(null)}
                />
            )}

            {productoEditandoId && (
                <ModalEditarPlatillo
                    producto={productos.find((p) => p.id === productoEditandoId)!}
                    categorias={categorias}
                    onCerrar={() => setProductoEditandoId(null)}
                    onGuardado={(cambios) => {
                        // Actualización de estado local inmediata (sin volver a
                        // pedirle todo a Supabase): mutación inmutable del array,
                        // reemplazando solo el producto editado por sus datos
                        // nuevos. La foto (y el resto de cambios) aparece al
                        // instante en la tabla, sin recargar la página.
                        setProductos((prev) =>
                            prev.map((p) =>
                                p.id === cambios.id
                                    ? {
                                          ...p,
                                          ...cambios,
                                          categorias: categorias.find((c) => c.id === cambios.categoria_id) ?? p.categorias,
                                      }
                                    : p
                            )
                        );
                    }}
                />
            )}
        </div>
    );
}

// ============================================================================
// Modal "Editar platillo" — nombre, precio, categoría, imagen y Agotado.
// Independiente del editor de receta (que sigue siendo su propia pantalla).
// ============================================================================

function ModalEditarPlatillo({
    producto,
    categorias,
    onCerrar,
    onGuardado,
}: {
    producto: ProductoMenuRow;
    categorias: CategoriaOption[];
    onCerrar: () => void;
    onGuardado: (cambios: {
        id: string;
        nombre: string;
        categoria_id: string | null;
        precio: number;
        imagen_url: string | null;
        agotado: boolean;
    }) => void;
}) {
    const supabase = getSupabaseBrowserClient();
    const [nombre, setNombre] = useState(producto.nombre);
    const [categoriaId, setCategoriaId] = useState(producto.categoria_id ?? '');
    const [precio, setPrecio] = useState(String(producto.precio));
    const [imagenUrl, setImagenUrl] = useState(producto.imagen_url ?? '');
    const [agotado, setAgotado] = useState(producto.agotado);
    const [error, setError] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);

    async function guardar() {
        setError(null);
        const precioNum = parseFloat(precio);
        if (!nombre.trim()) {
            setError('El nombre no puede estar vacío.');
            return;
        }
        if (isNaN(precioNum) || precioNum <= 0) {
            setError('El precio debe ser un número mayor a 0.');
            return;
        }

        const cambios = {
            nombre: nombre.trim(),
            categoria_id: categoriaId || null,
            precio: precioNum,
            imagen_url: imagenUrl.trim() || null,
            agotado,
        };

        setGuardando(true);
        const { error: err } = await supabase
            .from('productos')
            .update(cambios)
            .eq('id', producto.id);

        setGuardando(false);
        if (err) {
            setError('No se pudo guardar: ' + err.message);
            return;
        }
        // Se le pasa al padre exactamente lo que cambió, para que actualice
        // su estado local de inmediato sin volver a pedirle todo a Supabase.
        onGuardado({ id: producto.id, ...cambios });
        onCerrar();
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 rounded-2xl p-5 w-full max-w-md space-y-3">
                <h3 className="font-bold text-lg">Editar platillo</h3>

                <div>
                    <label className="text-sm text-neutral-400">Nombre</label>
                    <input
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                    />
                </div>
                <div>
                    <label className="text-sm text-neutral-400">Categoría</label>
                    <select
                        value={categoriaId}
                        onChange={(e) => setCategoriaId(e.target.value)}
                        className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none"
                    >
                        {categorias.map((c) => (
                            <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-sm text-neutral-400">Precio (RD$)</label>
                    <input
                        type="number"
                        value={precio}
                        onChange={(e) => setPrecio(e.target.value)}
                        className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none"
                    />
                </div>
                <div>
                    <SubidaImagenProducto valorActual={imagenUrl} onSubido={setImagenUrl} />
                </div>
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                    <input type="checkbox" checked={agotado} onChange={(e) => setAgotado(e.target.checked)} />
                    Marcar como Agotado (se ve en el POS pero no se puede vender)
                </label>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="flex gap-3 pt-2">
                    <button onClick={onCerrar} className="flex-1 py-2.5 rounded-xl bg-neutral-800 font-semibold text-sm">
                        Cancelar
                    </button>
                    <button
                        onClick={guardar}
                        disabled={guardando}
                        className="flex-1 py-2.5 rounded-xl bg-[#ff4d00] font-bold text-sm disabled:opacity-50"
                    >
                        {guardando ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Editor de receta — vincula insumos con un producto (para el costeo/inventario)
// ============================================================================

function EditorReceta({ productoId, insumos, onCerrar }: { productoId: string; insumos: InsumoOption[]; onCerrar: () => void }) {
    const supabase = getSupabaseBrowserClient();
    const [receta, setReceta] = useState<RecetaItem[]>([]);
    const [insumoNuevo, setInsumoNuevo] = useState('');
    const [cantidadNueva, setCantidadNueva] = useState('');
    const [cargando, setCargando] = useState(true);

    const cargarReceta = useCallback(async () => {
        const { data } = await supabase
            .from('recetas')
            .select('id, insumo_id, cantidad_requerida, insumos(nombre, unidad)')
            .eq('producto_id', productoId);
        setReceta((data as unknown as RecetaItem[]) ?? []);
        setCargando(false);
    }, [supabase, productoId]);

    useEffect(() => {
        cargarReceta();
    }, [cargarReceta]);

    async function agregarInsumoAReceta() {
        const cantidad = parseFloat(cantidadNueva);
        if (!insumoNuevo || isNaN(cantidad) || cantidad <= 0) return;

        await supabase.from('recetas').upsert(
            { producto_id: productoId, insumo_id: insumoNuevo, cantidad_requerida: cantidad },
            { onConflict: 'producto_id,insumo_id' }
        );
        setInsumoNuevo('');
        setCantidadNueva('');
        await cargarReceta();
    }

    async function quitarDeReceta(id: string) {
        await supabase.from('recetas').delete().eq('id', id);
        await cargarReceta();
    }

    return (
        <div className="bg-neutral-900 rounded-2xl p-4 space-y-3 border border-[#ff4d00]/40">
            <div className="flex justify-between items-center">
                <h3 className="font-bold">Receta de este platillo</h3>
                <button onClick={onCerrar} className="text-neutral-400 text-sm">Cerrar</button>
            </div>

            {cargando ? (
                <p className="text-neutral-400 text-sm">Cargando…</p>
            ) : (
                <>
                    <ul className="space-y-1">
                        {receta.map((r) => (
                            <li key={r.id} className="flex justify-between items-center text-sm bg-neutral-800 rounded-lg px-3 py-2">
                                <span>{r.cantidad_requerida} {r.insumos?.unidad} de {r.insumos?.nombre}</span>
                                <button onClick={() => quitarDeReceta(r.id)} className="text-red-400 text-xs">Quitar</button>
                            </li>
                        ))}
                        {receta.length === 0 && <p className="text-neutral-500 text-sm">Sin insumos vinculados todavía.</p>}
                    </ul>

                    <div className="flex gap-2 items-end pt-2 border-t border-neutral-800">
                        <div className="flex-1">
                            <label className="text-xs text-neutral-400">Insumo</label>
                            <select
                                value={insumoNuevo}
                                onChange={(e) => setInsumoNuevo(e.target.value)}
                                className="w-full mt-1 bg-neutral-800 rounded-lg px-2 py-2 text-sm outline-none"
                            >
                                <option value="">Elige…</option>
                                {insumos.map((i) => (
                                    <option key={i.id} value={i.id}>{i.nombre} ({i.unidad})</option>
                                ))}
                            </select>
                        </div>
                        <div className="w-28">
                            <label className="text-xs text-neutral-400">Cantidad</label>
                            <input
                                type="number"
                                value={cantidadNueva}
                                onChange={(e) => setCantidadNueva(e.target.value)}
                                className="w-full mt-1 bg-neutral-800 rounded-lg px-2 py-2 text-sm outline-none"
                            />
                        </div>
                        <button onClick={agregarInsumoAReceta} className="bg-[#ff4d00] font-semibold px-4 py-2 rounded-lg text-sm">
                            Agregar
                        </button>
                    </div>
                    <p className="text-xs text-neutral-500">
                        Ejemplo: si el Crusándwich lleva 2 unidades de pan y 0.3 lbs de carne,
                        agrega esas dos líneas aquí. Así, cada vez que se venda, el sistema
                        descuenta automáticamente esas cantidades del inventario.
                    </p>
                </>
            )}
        </div>
    );
}

// ============================================================================
// Rentabilidad por producto — usa la vista v_rentabilidad_productos del SQL
// ============================================================================

function PanelRentabilidad() {
    const supabase = getSupabaseBrowserClient();
    const [filas, setFilas] = useState<RentabilidadRow[]>([]);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        supabase
            .from('v_rentabilidad_productos')
            .select('*')
            .order('margen_pct', { ascending: true })
            .then(({ data }) => {
                setFilas((data as RentabilidadRow[]) ?? []);
                setCargando(false);
            });
    }, [supabase]);

    if (cargando) return <p className="text-neutral-400">Cargando rentabilidad…</p>;

    return (
        <div className="bg-neutral-900 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-neutral-800 text-neutral-400">
                    <tr>
                        <th className="text-left p-3">Producto</th>
                        <th className="text-right p-3">Precio venta</th>
                        <th className="text-right p-3">Costo receta</th>
                        <th className="text-right p-3">Margen</th>
                        <th className="text-right p-3">Margen %</th>
                    </tr>
                </thead>
                <tbody>
                    {filas.map((f) => (
                        <tr key={f.producto_id} className="border-t border-neutral-800">
                            <td className="p-3">{f.producto}</td>
                            <td className="p-3 text-right">RD$ {Number(f.precio_venta).toFixed(2)}</td>
                            <td className="p-3 text-right">RD$ {Number(f.costo_produccion).toFixed(2)}</td>
                            <td className="p-3 text-right">RD$ {Number(f.margen).toFixed(2)}</td>
                            <td className={`p-3 text-right font-semibold ${Number(f.margen_pct) < 40 ? 'text-red-400' : 'text-green-400'}`}>
                                {Number(f.margen_pct).toFixed(1)}%
                            </td>
                        </tr>
                    ))}
                    {filas.length === 0 && (
                        <tr><td colSpan={5} className="p-6 text-center text-neutral-500">
                            No hay recetas configuradas todavía — sin recetas, el costo de producción no se puede calcular.
                        </td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
