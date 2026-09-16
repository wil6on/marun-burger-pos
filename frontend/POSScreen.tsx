'use client';

// ============================================================================
// POSScreen.tsx — Pantalla principal de caja (Punto de Venta)
// Diseño: tema oscuro (#111111) + acento Naranja Fuego (#ff4d00)
// Responsive: layout de 2 columnas en tablet/desktop, ticket como bottom-sheet
// deslizable en móvil. Grid de productos filtrado por categoría real.
//
// FASE 1 — ITBIS desactivado: el total es lineal (precio x cantidad), sin
// desglose de impuesto. La arquitectura de tax_rate queda "dormida" en la
// base de datos por si se reactiva en el futuro, pero el cálculo aquí no
// la usa. También soporta productos marcados como "Agotado" (visibles pero
// no se pueden agregar al carrito).
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
    guardarVentaLocal,
    obtenerProductosCache,
    obtenerCategoriasCache,
    obtenerSiguienteNumeroOrdenLocal,
    generarUUID,
    ProductoCache,
    CategoriaCache,
    VentaLocal,
    ItemVentaLocal,
} from '../sync-engine/localDb';
import { iniciarSyncWorker, sincronizarVentasPendientes } from '../sync-engine/syncWorker';
import { imprimirTicket } from '../print/ticketPrinter';
import ProductModifierModal from './ProductModifierModal';

interface CarritoItem extends ItemVentaLocal {
    lineaId: string;
}

export default function POSScreen() {
    const [productos, setProductos] = useState<ProductoCache[]>([]);
    const [categorias, setCategorias] = useState<CategoriaCache[]>([]);
    const [categoriaActivaId, setCategoriaActivaId] = useState<string | null>(null);
    const [carrito, setCarrito] = useState<CarritoItem[]>([]);
    const [syncStatus, setSyncStatus] = useState<'online' | 'offline' | 'syncing'>('offline');
    const [mostrarCobro, setMostrarCobro] = useState(false);
    const [ticketAbiertoMobile, setTicketAbiertoMobile] = useState(false);

    useEffect(() => {
        obtenerProductosCache().then(setProductos);
        obtenerCategoriasCache().then(setCategorias);
        const cleanup = iniciarSyncWorker(setSyncStatus);
        return cleanup;
    }, []);

    // Re-sincroniza la lista visible cada vez que el worker actualiza el cache
    useEffect(() => {
        if (syncStatus === 'online') {
            obtenerProductosCache().then(setProductos);
            obtenerCategoriasCache().then(setCategorias);
        }
    }, [syncStatus]);

    const productosFiltrados = useMemo(
        () =>
            productos.filter(
                (p) => p.activo && (categoriaActivaId === null || p.categoria_id === categoriaActivaId)
            ),
        [productos, categoriaActivaId]
    );

    // Total lineal, sin ITBIS (Fase 1: regla estricta del negocio).
    const total = useMemo(
        () => carrito.reduce((sum, item) => sum + item.precio_unitario * item.cantidad, 0),
        [carrito]
    );
    const cantidadTotalItems = useMemo(
        () => carrito.reduce((acc, i) => acc + i.cantidad, 0),
        [carrito]
    );

    function agregarAlCarrito(producto: ProductoCache) {
        if (producto.agotado) return; // no se puede vender un producto agotado
        setCarrito((prev) => {
            const existente = prev.find((i) => i.producto_id === producto.id);
            if (existente) {
                return prev.map((i) =>
                    i.producto_id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
                );
            }
            return [
                ...prev,
                {
                    lineaId: generarUUID(),
                    producto_id: producto.id,
                    nombre_producto: producto.nombre,
                    cantidad: 1,
                    precio_unitario: producto.precio,
                },
            ];
        });
    }

    function cambiarCantidad(lineaId: string, delta: number) {
        setCarrito((prev) =>
            prev
                .map((i) => (i.lineaId === lineaId ? { ...i, cantidad: i.cantidad + delta } : i))
                .filter((i) => i.cantidad > 0)
        );
    }

    // NUEVO — actualiza la nota de cocina de una línea puntual del carrito,
    // de forma inmutable (mismo patrón que cambiarCantidad). No toca precio,
    // cantidad ni ningún otro campo de la línea.
    function actualizarNotaCocina(lineaId: string, nota: string) {
        setCarrito((prev) =>
            prev.map((i) => (i.lineaId === lineaId ? { ...i, kitchen_notes: nota || undefined } : i))
        );
    }

    function limpiarCarrito() {
        setCarrito([]);
        setMostrarCobro(false);
        setTicketAbiertoMobile(false);
    }

    return (
        <div className="flex flex-col lg:flex-row h-[100dvh] w-full bg-[#111111] text-white font-sans overflow-hidden">
            {/* ---------- Columna izquierda: catálogo ---------- */}
            <div className="flex-1 flex flex-col p-3 sm:p-4 overflow-hidden min-h-0">
                <header className="flex items-center justify-between mb-3 sm:mb-4 shrink-0">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <img
                            src="/logo-marun-burger.png"
                            alt="Marun Burger"
                            className="h-8 w-8 sm:h-10 sm:w-10 rounded-full"
                        />
                        <h1 className="text-base sm:text-xl font-bold tracking-tight">Marun Burger POS</h1>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4">
                        <EstadoConexion status={syncStatus} />
                        <Link
                            href="/caja"
                            className="text-xs sm:text-sm text-neutral-400 hover:text-white border border-neutral-700 rounded-full px-3 py-1.5 whitespace-nowrap"
                        >
                            Cuadre de caja
                        </Link>
                        <Link
                            href="/admin"
                            className="text-xs sm:text-sm text-neutral-400 hover:text-white border border-neutral-700 rounded-full px-3 py-1.5 whitespace-nowrap"
                            title="Panel del dueño (requiere iniciar sesión)"
                        >
                            Panel del dueño
                        </Link>
                    </div>
                </header>

                {/* Tabs de categorías (reales, desde Supabase) */}
                <nav className="flex gap-2 mb-3 sm:mb-4 overflow-x-auto shrink-0 -mx-1 px-1">
                    <button
                        onClick={() => setCategoriaActivaId(null)}
                        className={`px-4 sm:px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                            categoriaActivaId === null
                                ? 'bg-[#ff4d00] text-white'
                                : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700'
                        }`}
                    >
                        Todos
                    </button>
                    {categorias.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setCategoriaActivaId(cat.id)}
                            className={`px-4 sm:px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                                categoriaActivaId === cat.id
                                    ? 'bg-[#ff4d00] text-white'
                                    : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700'
                            }`}
                        >
                            {cat.nombre}
                        </button>
                    ))}
                    {categorias.length === 0 && (
                        <span className="text-neutral-500 text-sm">Sin categorías en cache aún…</span>
                    )}
                </nav>

                {/* Grid de productos — 2 columnas en celular, más en pantallas grandes */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 overflow-y-auto pb-24 lg:pb-4">
                    {productosFiltrados.map((producto) => (
                        <button
                            key={producto.id}
                            onClick={() => agregarAlCarrito(producto)}
                            disabled={producto.agotado}
                            className={`relative flex flex-col items-start bg-neutral-900 border border-neutral-800 rounded-2xl p-3 text-left transition-all ${
                                producto.agotado
                                    ? 'opacity-40 cursor-not-allowed'
                                    : 'active:border-[#ff4d00] active:scale-95'
                            }`}
                        >
                            {producto.agotado && (
                                <span className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
                                    AGOTADO
                                </span>
                            )}
                            <div className="w-full aspect-square bg-neutral-800 rounded-xl mb-2 overflow-hidden">
                                <ImagenProducto src={producto.imagen_url} alt={producto.nombre} />
                            </div>
                            <span className="font-semibold text-sm">{producto.nombre}</span>
                            <span className="text-[#ff4d00] font-bold">
                                RD$ {producto.precio.toFixed(2)}
                            </span>
                        </button>
                    ))}
                    {productosFiltrados.length === 0 && (
                        <p className="text-neutral-500 col-span-full text-center py-10">
                            No hay productos en esta categoría (o el cache aún no ha sincronizado).
                            Conéctate a internet al menos una vez.
                        </p>
                    )}
                </div>
            </div>

            {/* ---------- Ticket: panel fijo en desktop/tablet ---------- */}
            <div className="hidden lg:flex w-[380px] bg-white text-neutral-900 flex-col shadow-2xl">
                <TicketPanel
                    carrito={carrito}
                    total={total}
                    onCambiarCantidad={cambiarCantidad}
                    onActualizarNotaCocina={actualizarNotaCocina}
                    onCobrar={() => setMostrarCobro(true)}
                />
            </div>

            {/* ---------- Ticket: barra + bottom-sheet en móvil ---------- */}
            <div className="lg:hidden">
                {!ticketAbiertoMobile && carrito.length > 0 && (
                    <button
                        onClick={() => setTicketAbiertoMobile(true)}
                        className="fixed bottom-0 left-0 right-0 bg-[#ff4d00] text-white font-bold py-4 px-4 flex justify-between items-center shadow-2xl z-40"
                        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                    >
                        <span>{cantidadTotalItems} ítem(s) en el ticket</span>
                        <span>Ver ticket · RD$ {total.toFixed(2)}</span>
                    </button>
                )}

                {ticketAbiertoMobile && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
                        <div className="bg-white text-neutral-900 w-full max-h-[85vh] rounded-t-3xl flex flex-col">
                            <div className="flex justify-center pt-2">
                                <div className="w-10 h-1.5 bg-neutral-300 rounded-full" />
                            </div>
                            <div className="flex justify-between items-center px-4 pt-2">
                                <h2 className="font-bold text-lg">Orden actual</h2>
                                <button
                                    onClick={() => setTicketAbiertoMobile(false)}
                                    className="text-neutral-500 text-sm font-semibold"
                                >
                                    Cerrar
                                </button>
                            </div>
                            <TicketPanel
                                carrito={carrito}
                                total={total}
                                onCambiarCantidad={cambiarCantidad}
                                onActualizarNotaCocina={actualizarNotaCocina}
                                onCobrar={() => setMostrarCobro(true)}
                                safeAreaBottom
                            />
                        </div>
                    </div>
                )}
            </div>

            {mostrarCobro && (
                <ModalCobro
                    total={total}
                    carrito={carrito}
                    onCerrar={() => setMostrarCobro(false)}
                    onVentaRegistrada={limpiarCarrito}
                />
            )}
        </div>
    );
}

// ============================================================================
// Imagen del producto, con fallback automático a un placeholder atractivo si
// no hay imagen_url, está vacía, o la imagen falla al cargar (onError).
// ============================================================================

function ImagenProducto({ src, alt }: { src: string | null; alt: string }) {
    const [fallo, setFallo] = useState(false);
    const mostrarPlaceholder = !src || src.trim() === '' || fallo;

    if (mostrarPlaceholder) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 relative overflow-hidden">
                {/* Patrón sutil de fondo (rejilla de puntos) */}
                <div
                    className="absolute inset-0 opacity-[0.15]"
                    style={{
                        backgroundImage: 'radial-gradient(circle, #ff4d00 1px, transparent 1px)',
                        backgroundSize: '10px 10px',
                    }}
                />
                {/* Ícono de plato/restaurante, centrado */}
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="w-8 h-8 text-neutral-500 relative z-10"
                >
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="3.5" />
                    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" strokeLinecap="round" />
                </svg>
            </div>
        );
    }

    return (
        <img
            src={src!}
            alt={alt}
            onError={() => setFallo(true)}
            className="w-full h-full object-cover"
        />
    );
}

// ============================================================================
// Panel de ticket reutilizable (desktop lateral / bottom-sheet móvil)
// ============================================================================

function TicketPanel({
    carrito,
    total,
    onCambiarCantidad,
    onActualizarNotaCocina,
    onCobrar,
    safeAreaBottom,
}: {
    carrito: CarritoItem[];
    total: number;
    onCambiarCantidad: (lineaId: string, delta: number) => void;
    onActualizarNotaCocina?: (lineaId: string, nota: string) => void; // NUEVO — opcional, aditivo
    onCobrar: () => void;
    safeAreaBottom?: boolean;
}) {
    // NUEVO — controla qué línea del carrito tiene el modal de nota abierto.
    // No afecta el resto del estado del componente.
    const [lineaEditandoNota, setLineaEditandoNota] = useState<string | null>(null);

    return (
        <>
            <div className="p-4 border-b border-dashed border-neutral-300 hidden lg:block">
                <h2 className="font-bold text-lg">Orden actual</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {carrito.length === 0 && (
                    <p className="text-neutral-400 text-center mt-10">Ticket vacío</p>
                )}
                {carrito.map((item) => (
                    <div key={item.lineaId} className="flex justify-between items-center">
                        <div>
                            <p className="font-medium text-sm">{item.nombre_producto}</p>
                            <p className="text-xs text-neutral-500">
                                RD$ {item.precio_unitario.toFixed(2)} c/u
                            </p>
                            {/* NUEVO — nota de cocina, solo se muestra si existe */}
                            {item.kitchen_notes && (
                                <p className="text-sm text-gray-400 italic">{item.kitchen_notes}</p>
                            )}
                            {/* NUEVO — botón para agregar/editar la nota de esta línea */}
                            {onActualizarNotaCocina && (
                                <button
                                    onClick={() => setLineaEditandoNota(item.lineaId)}
                                    className="text-[11px] text-[#ff4d00] font-semibold mt-0.5"
                                >
                                    {item.kitchen_notes ? 'Editar nota' : '+ Nota'}
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onCambiarCantidad(item.lineaId, -1)}
                                className="w-8 h-8 lg:w-6 lg:h-6 rounded-full bg-neutral-200 font-bold text-lg lg:text-base"
                            >
                                −
                            </button>
                            <span className="w-5 text-center">{item.cantidad}</span>
                            <button
                                onClick={() => onCambiarCantidad(item.lineaId, 1)}
                                className="w-8 h-8 lg:w-6 lg:h-6 rounded-full bg-neutral-200 font-bold text-lg lg:text-base"
                            >
                                +
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Fase 1: sin desglose de ITBIS — total lineal directo */}
            <div className="p-4 border-t border-dashed border-neutral-300 text-sm">
                <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>RD$ {total.toFixed(2)}</span>
                </div>
            </div>

            <div className="p-4" style={safeAreaBottom ? { paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' } : undefined}>
                <button
                    disabled={carrito.length === 0}
                    onClick={onCobrar}
                    className="w-full bg-[#ff4d00] disabled:bg-neutral-300 disabled:text-neutral-500 text-white font-bold py-4 rounded-xl text-lg active:scale-98 transition-transform"
                >
                    Cobrar RD$ {total.toFixed(2)}
                </button>
            </div>

            {/* NUEVO — modal de modificadores/nota de cocina, aditivo */}
            {lineaEditandoNota && onActualizarNotaCocina && (
                <ProductModifierModal
                    nombreProducto={carrito.find((i) => i.lineaId === lineaEditandoNota)?.nombre_producto ?? ''}
                    notaInicial={carrito.find((i) => i.lineaId === lineaEditandoNota)?.kitchen_notes ?? ''}
                    onGuardar={(nota) => {
                        onActualizarNotaCocina(lineaEditandoNota, nota);
                        setLineaEditandoNota(null);
                    }}
                    onCerrar={() => setLineaEditandoNota(null)}
                />
            )}
        </>
    );
}

// ============================================================================
// Indicador de estado de conexión / sincronización
// ============================================================================

function EstadoConexion({ status }: { status: 'online' | 'offline' | 'syncing' }) {
    const config = {
        online: { color: 'bg-green-500', label: 'En línea' },
        offline: { color: 'bg-red-500', label: 'Sin conexión' },
        syncing: { color: 'bg-yellow-500', label: 'Sincronizando…' },
    }[status];

    return (
        <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className={`w-2 h-2 rounded-full ${config.color}`} />
            <span className="hidden sm:inline">{config.label}</span>
        </div>
    );
}

// ============================================================================
// Modal de cobro: pagos mixtos (efectivo/tarjeta) + tipo de comprobante e-CF
// Al confirmar: guarda offline, sincroniza e IMPRIME el ticket automáticamente.
// Fase 1: sin ITBIS — se guarda subtotal = total, itbis = 0, tax_rate = 0.
// ============================================================================

function ModalCobro({
    total,
    carrito,
    onCerrar,
    onVentaRegistrada,
}: {
    total: number;
    carrito: CarritoItem[];
    onCerrar: () => void;
    onVentaRegistrada: () => void;
}) {
    const [tipoEcf, setTipoEcf] = useState<'CONSUMO' | 'CREDITO_FISCAL'>('CONSUMO');
    const [rncCedula, setRncCedula] = useState('');
    const [nombreCliente, setNombreCliente] = useState(''); // NUEVO — opcional, aditivo
    const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'MIXTO'>('EFECTIVO');
    const [montoEfectivo, setMontoEfectivo] = useState(total);
    const [montoTarjeta, setMontoTarjeta] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [procesando, setProcesando] = useState(false);

    function validarRnc(valor: string): boolean {
        if (tipoEcf === 'CONSUMO' && valor === '') return true;
        return /^[0-9]{9}$/.test(valor) || /^[0-9]{11}$/.test(valor);
    }

    async function confirmarCobro() {
        setError(null);

        if (tipoEcf === 'CREDITO_FISCAL' && !validarRnc(rncCedula)) {
            setError('RNC/Cédula inválido. Debe tener 9 u 11 dígitos.');
            return;
        }

        if (metodoPago === 'MIXTO' && Math.abs(montoEfectivo + montoTarjeta - total) > 0.01) {
            setError('La suma de efectivo + tarjeta debe ser igual al total.');
            return;
        }

        setProcesando(true);

        const numeroOrdenLocal = await obtenerSiguienteNumeroOrdenLocal();

        const venta: VentaLocal = {
            id: generarUUID(),
            numero_orden_local: numeroOrdenLocal,
            cliente_id: null, // se resuelve/crea en Supabase al sincronizar (ver push_sync_ventas)
            cliente_nombre: nombreCliente.trim() || undefined,
            cliente_rnc_cedula: tipoEcf === 'CREDITO_FISCAL' ? (rncCedula.trim() || undefined) : undefined,
            cajero_id: null, // inyectar desde sesión de Supabase Auth
            tipo_ecf: tipoEcf,
            ncf: null, // se asigna en backend/DGII al sincronizar
            subtotal: total, // Fase 1: sin ITBIS, subtotal = total
            itbis: 0,
            total,
            metodo_pago: metodoPago,
            monto_efectivo: metodoPago === 'TARJETA' ? 0 : metodoPago === 'MIXTO' ? montoEfectivo : total,
            monto_tarjeta: metodoPago === 'EFECTIVO' ? 0 : metodoPago === 'MIXTO' ? montoTarjeta : total,
            created_at_local: new Date().toISOString(),
            is_synced: false,
            sync_attempts: 0,
            items: carrito.map((c) => ({
                producto_id: c.producto_id,
                nombre_producto: c.nombre_producto,
                cantidad: c.cantidad,
                precio_unitario: c.precio_unitario,
                notas: c.notas,
                kitchen_notes: c.kitchen_notes,
            })),
        };

        await guardarVentaLocal(venta);

        // Intento de sync inmediato (no bloqueante si falla; el worker reintentará)
        sincronizarVentasPendientes().catch(() => {});

        // Imprime de inmediato usando el número de orden local (funciona offline)
        try {
            await imprimirTicket(venta, numeroOrdenLocal);
        } catch (err) {
            console.warn('No se pudo imprimir el ticket automáticamente:', err);
        }

        setProcesando(false);
        onVentaRegistrada();
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-neutral-900 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 w-full sm:w-[420px] max-h-[92vh] overflow-y-auto text-white space-y-4">
                <h3 className="text-xl font-bold">Finalizar cobro</h3>

                <div>
                    <label className="text-sm text-neutral-400">Nombre del cliente (opcional)</label>
                    <input
                        value={nombreCliente}
                        onChange={(e) => setNombreCliente(e.target.value)}
                        placeholder="Consumidor Final"
                        className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-3 sm:py-2 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                    />
                </div>

                <div>
                    <label className="text-sm text-neutral-400">Tipo de comprobante</label>
                    <div className="flex gap-2 mt-1">
                        {(['CONSUMO', 'CREDITO_FISCAL'] as const).map((tipo) => (
                            <button
                                key={tipo}
                                onClick={() => setTipoEcf(tipo)}
                                className={`flex-1 py-3 sm:py-2 rounded-lg text-sm font-semibold ${
                                    tipoEcf === tipo ? 'bg-[#ff4d00]' : 'bg-neutral-800'
                                }`}
                            >
                                {tipo === 'CONSUMO' ? 'Factura de Consumo' : 'Crédito Fiscal'}
                            </button>
                        ))}
                    </div>
                </div>

                {tipoEcf === 'CREDITO_FISCAL' && (
                    <div>
                        <label className="text-sm text-neutral-400">RNC / Cédula del cliente</label>
                        <input
                            value={rncCedula}
                            onChange={(e) => setRncCedula(e.target.value)}
                            placeholder="9 u 11 dígitos"
                            inputMode="numeric"
                            className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-3 sm:py-2 text-sm outline-none focus:ring-2 focus:ring-[#ff4d00]"
                        />
                    </div>
                )}

                <div>
                    <label className="text-sm text-neutral-400">Método de pago</label>
                    <div className="flex gap-2 mt-1">
                        {(['EFECTIVO', 'TARJETA', 'MIXTO'] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMetodoPago(m)}
                                className={`flex-1 py-3 sm:py-2 rounded-lg text-sm font-semibold ${
                                    metodoPago === m ? 'bg-[#ff4d00]' : 'bg-neutral-800'
                                }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                {metodoPago === 'MIXTO' && (
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-xs text-neutral-400">Efectivo</label>
                            <input
                                type="number"
                                inputMode="decimal"
                                value={montoEfectivo}
                                onChange={(e) => setMontoEfectivo(parseFloat(e.target.value) || 0)}
                                className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-3 sm:py-2 text-sm outline-none"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs text-neutral-400">Tarjeta</label>
                            <input
                                type="number"
                                inputMode="decimal"
                                value={montoTarjeta}
                                onChange={(e) => setMontoTarjeta(parseFloat(e.target.value) || 0)}
                                className="w-full mt-1 bg-neutral-800 rounded-lg px-3 py-3 sm:py-2 text-sm outline-none"
                            />
                        </div>
                    </div>
                )}

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="flex justify-between font-bold text-lg pt-2 border-t border-neutral-700">
                    <span>Total</span>
                    <span>RD$ {total.toFixed(2)}</span>
                </div>

                <div className="flex gap-3 pt-2 pb-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
                    <button
                        onClick={onCerrar}
                        className="flex-1 py-4 sm:py-3 rounded-xl bg-neutral-800 font-semibold"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={confirmarCobro}
                        disabled={procesando}
                        className="flex-1 py-4 sm:py-3 rounded-xl bg-[#ff4d00] font-bold disabled:opacity-50"
                    >
                        {procesando ? 'Procesando…' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
