// ============================================================================
// ticketPrinter.ts — Generación de ticket térmico 80mm (estilo comida rápida)
// Soporta: (a) comandos ESC/POS crudos vía Web Bluetooth/Serial
//          (b) fallback "Print to PDF" con layout monoespaciado para navegador
// ============================================================================

import type { VentaLocal } from '../sync-engine/localDb';

const NEGOCIO = {
    nombre: 'MARUN BURGER',
    rnc: '1-31-XXXXX-X', // reemplazar con el RNC real del negocio
    telefono: '(829) 454-2596',
    direccion: 'Carretera Mella, número 5, al lado de Agua Sauri',
};

const ANCHO_TICKET = 42; // columnas aprox. para papel de 80mm en fuente monoespaciada

// ============================================================================
// 1) HTML/PDF: layout listo para window.print() o export a PDF
// ============================================================================

export function generarTicketHTML(venta: VentaLocal, numeroOrden: number): string {
    const fecha = new Date(venta.created_at_local).toLocaleString('es-DO');
    const nombreCliente = venta.cliente_nombre?.trim() || 'Consumidor Final';

    const filasItems = venta.items
        .map((item) => {
            const nombre = item.nombre_producto;
            const cantidad = item.cantidad;
            const precioLinea = (item.cantidad * item.precio_unitario).toFixed(2);
            // 4) NOTAS — fila debajo del producto, cursiva, más pequeña, con
            // padding a la izquierda para que se note que pertenecen al ítem.
            const notas = item.notas
                ? `<div class="nota-fila">${escapeHtml(item.notas)}</div>`
                : '';
            const kitchenNota = item.kitchen_notes
                ? `<div class="kitchen-nota-fila">&gt;&gt; Nota: ${escapeHtml(item.kitchen_notes)}</div>`
                : '';
            return `
                <div class="fila-item">
                    <span class="col-cant">${cantidad}x</span>
                    <span class="col-nombre">${escapeHtml(nombre)}</span>
                    <span class="col-precio">${precioLinea}</span>
                </div>
                ${notas}
                ${kitchenNota}
            `;
        })
        .join('');

    return `
    <html>
    <head>
        <meta charset="utf-8" />
        <style>
            /* ============================================================
               Base — 80mm, blanco y negro puro, sin márgenes, monoespaciado.
               ============================================================ */
            @page { size: 80mm auto; margin: 0; }

            * { box-sizing: border-box; }

            body {
                width: 80mm;
                font-family: 'Courier New', Courier, monospace;
                font-size: 12px;
                color: #000;
                background: #fff;
                margin: 0;
                padding: 8px;
            }

            /* ---------- 1) CABECERA — estrictamente centrada ---------- */
            .cabecera {
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
            }
            .logo-negocio {
                display: block;
                margin: 0 auto 4px auto;
                max-width: 55mm;
                max-height: 22mm;
                /* Fuerza blanco y negro de alto contraste para térmica */
                filter: grayscale(1) contrast(2.2) brightness(1.05);
                -webkit-filter: grayscale(1) contrast(2.2) brightness(1.05);
            }
            .nombre-negocio { font-weight: bold; font-size: 16px; }

            /* ---------- separador punteado, reutilizado en todo el ticket --------- */
            .separador { border-bottom: 1px dashed #000; margin: 6px 0; }

            /* ---------- 2) METADATOS — alineados a la izquierda ---------- */
            .metadatos { text-align: left; }
            .metadatos .orden { font-weight: bold; font-size: 14px; margin-bottom: 2px; }
            .metadatos .cliente { font-weight: bold; }

            /* ---------- 3) PRODUCTOS — grid de 3 columnas, sin centrar ---------- */
            .fila-item {
                display: grid;
                grid-template-columns: 24px 1fr auto;
                column-gap: 6px;
                align-items: start;
                text-align: left;
            }
            .col-cant { text-align: left; }
            .col-nombre { text-align: left; word-break: break-word; }
            .col-precio { text-align: right; white-space: nowrap; }

            /* ---------- 4) NOTAS del producto — debajo, cursiva, más chicas ---------- */
            .nota-fila {
                grid-column: 1 / -1;
                font-size: 10px;
                font-style: italic;
                color: #333;
                padding-left: 30px;
            }
            .kitchen-nota-fila {
                grid-column: 1 / -1;
                font-size: 11px;
                font-weight: bold;
                font-style: italic;
                padding-left: 30px;
            }

            /* ---------- 5) TOTAL — TOTAL a la izquierda, monto a la derecha ---------- */
            .fila-total {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                font-weight: bold;
                font-size: 16px;
            }

            /* ---------- 6) PIE — estrictamente centrado ---------- */
            .pie {
                text-align: center;
                font-size: 10px;
                margin-top: 10px;
            }
            .redes-sociales {
                text-align: center;
                font-size: 11px;
                font-weight: bold;
                margin-top: 6px;
            }

            /* ============================================================
               @media print — blanco y negro puro, cero márgenes, sin
               encabezado/pie que agregan Chrome/Safari al imprimir.
               ============================================================ */
            @media print {
                html, body {
                    width: 80mm;
                    margin: 0 !important;
                    padding: 4px !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    color: #000 !important;
                    background: #fff !important;
                }
                .logo-negocio {
                    filter: grayscale(1) contrast(2.5) brightness(1) !important;
                    -webkit-filter: grayscale(1) contrast(2.5) brightness(1) !important;
                }
            }
        </style>
    </head>
    <body>
        <!-- 1) CABECERA CENTRALIZADA -->
        <div class="cabecera">
            <img src="/logo-marun-burger.png" alt="${NEGOCIO.nombre}" class="logo-negocio" />
            <div class="nombre-negocio">${NEGOCIO.nombre}</div>
            <div>${NEGOCIO.direccion}</div>
            <div>Tel: ${NEGOCIO.telefono}</div>
            <div>RNC: ${NEGOCIO.rnc}</div>
        </div>

        <div class="separador"></div>

        <!-- 2) METADATOS ALINEADOS A LA IZQUIERDA -->
        <div class="metadatos">
            <div class="orden">ORDEN #${numeroOrden}</div>
            <div>Fecha: ${fecha}</div>
            <div>Comprobante: ${venta.tipo_ecf === 'CONSUMO' ? 'Factura de Consumo' : 'Crédito Fiscal'}</div>
            ${venta.ncf ? `<div>NCF: ${venta.ncf}</div>` : ''}
            <div class="cliente">Cliente: ${escapeHtml(nombreCliente)}</div>
        </div>

        <div class="separador"></div>

        <!-- 3) y 4) PRODUCTOS EN GRID + NOTAS -->
        ${filasItems}

        <div class="separador"></div>

        <!-- 5) TOTAL -->
        <div class="fila-total">
            <span>TOTAL</span>
            <span>RD$ ${venta.total.toFixed(2)}</span>
        </div>

        <div class="separador"></div>

        <!-- 6) PIE CENTRALIZADO -->
        <div class="pie">
            ¡Gracias por su compra!<br/>
            Conserve su ticket para reclamar su pedido.<br/>
            <strong>Sin distinción de persona</strong>
        </div>
        <div class="redes-sociales">Síguenos en IG: @marun_burger10</div>
    </body>
    </html>
    `;
}

export function imprimirViaNavegador(venta: VentaLocal, numeroOrden: number): void {
    const html = generarTicketHTML(venta, numeroOrden);
    const ventana = window.open('', '_blank', 'width=380,height=600');
    if (!ventana) {
        // Antes esto fallaba en silencio: el navegador bloquea el pop-up
        // (bloqueador de ventanas emergentes) y el cajero nunca se entera de
        // que el ticket no se imprimió. Ahora se registra Y se avisa.
        console.error(
            '[TicketPrinter] No se pudo abrir la ventana del ticket — probablemente el ' +
            'navegador bloqueó la ventana emergente. Revisa el ícono de bloqueo en la ' +
            'barra de direcciones y permite pop-ups para este sitio.'
        );
        alert(
            'No se pudo abrir el ticket para imprimir: el navegador bloqueó la ventana ' +
            'emergente. Busca el ícono de "pop-up bloqueado" en la barra de direcciones, ' +
            'permite las ventanas emergentes para este sitio, e intenta cobrar de nuevo.'
        );
        return;
    }
    ventana.document.write(html);
    ventana.document.close();
    ventana.onload = () => {
        ventana.focus();
        ventana.print();
    };
}

function escapeHtml(str: string): string {
    return str.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]!));
}

// ============================================================================
// 2) ESC/POS: comandos binarios para impresora térmica real (80mm)
//    Envío vía Web Bluetooth (BLE) o Web Serial API
// ============================================================================

const ESC = 0x1b;
const GS = 0x1d;

const COMANDOS = {
    INIT: [ESC, 0x40],
    ALINEAR_CENTRO: [ESC, 0x61, 0x01],
    ALINEAR_IZQUIERDA: [ESC, 0x61, 0x00],
    NEGRITA_ON: [ESC, 0x45, 0x01],
    NEGRITA_OFF: [ESC, 0x45, 0x00],
    TEXTO_DOBLE_ALTO: [GS, 0x21, 0x11],
    TEXTO_NORMAL: [GS, 0x21, 0x00],
    CORTE_PAPEL: [GS, 0x56, 0x41, 0x00],
    SALTO_LINEA: [0x0a],
};

function textoABytes(texto: string): number[] {
    return Array.from(new TextEncoder().encode(texto));
}

function filaItemEscPos(cantidad: number, nombre: string, precio: number): string {
    const izquierda = `${cantidad}x ${nombre}`;
    const derecha = precio.toFixed(2);
    const espacios = Math.max(1, ANCHO_TICKET - izquierda.length - derecha.length);
    return izquierda + ' '.repeat(espacios) + derecha;
}

/** Construye el buffer completo de comandos ESC/POS para el ticket */
export function generarComandosEscPos(venta: VentaLocal, numeroOrden: number): Uint8Array {
    const bytes: number[] = [];

    bytes.push(...COMANDOS.INIT);
    bytes.push(...COMANDOS.ALINEAR_CENTRO);
    bytes.push(...COMANDOS.NEGRITA_ON);
    bytes.push(...textoABytes(NEGOCIO.nombre));
    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(...COMANDOS.NEGRITA_OFF);

    bytes.push(...textoABytes(NEGOCIO.direccion));
    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(...textoABytes(`Tel: ${NEGOCIO.telefono}`));
    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(...textoABytes(`RNC: ${NEGOCIO.rnc}`));
    bytes.push(...COMANDOS.SALTO_LINEA);

    bytes.push(...COMANDOS.TEXTO_DOBLE_ALTO);
    bytes.push(...COMANDOS.NEGRITA_ON);
    bytes.push(...textoABytes(`ORDEN #${numeroOrden}`));
    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(...COMANDOS.NEGRITA_OFF);
    bytes.push(...COMANDOS.TEXTO_NORMAL);

    bytes.push(...COMANDOS.ALINEAR_IZQUIERDA);
    bytes.push(...textoABytes('-'.repeat(ANCHO_TICKET)));
    bytes.push(...COMANDOS.SALTO_LINEA);

    bytes.push(...textoABytes(`Fecha: ${new Date(venta.created_at_local).toLocaleString('es-DO')}`));
    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(
        ...textoABytes(
            `Comprobante: ${venta.tipo_ecf === 'CONSUMO' ? 'Consumo' : 'Credito Fiscal'}`
        )
    );
    bytes.push(...COMANDOS.SALTO_LINEA);
    if (venta.ncf) {
        bytes.push(...textoABytes(`NCF: ${venta.ncf}`));
        bytes.push(...COMANDOS.SALTO_LINEA);
    }

    // 2) CLIENTE — debajo de la orden, antes de los productos
    bytes.push(...COMANDOS.NEGRITA_ON);
    bytes.push(...textoABytes(`Cliente: ${venta.cliente_nombre?.trim() || 'Consumidor Final'}`));
    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(...COMANDOS.NEGRITA_OFF);

    bytes.push(...textoABytes('-'.repeat(ANCHO_TICKET)));
    bytes.push(...COMANDOS.SALTO_LINEA);

    for (const item of venta.items) {
        bytes.push(...textoABytes(filaItemEscPos(item.cantidad, item.nombre_producto, item.cantidad * item.precio_unitario)));
        bytes.push(...COMANDOS.SALTO_LINEA);
        if (item.notas) {
            bytes.push(...textoABytes(`   ${item.notas}`));
            bytes.push(...COMANDOS.SALTO_LINEA);
        }
        // NUEVO — nota de cocina en negrita, con prefijo ">> Nota:" para que
        // el cocinero la vea con claridad. Aditivo: no reemplaza 'item.notas'.
        if (item.kitchen_notes) {
            bytes.push(...COMANDOS.NEGRITA_ON);
            bytes.push(...textoABytes(`   >> Nota: ${item.kitchen_notes}`));
            bytes.push(...COMANDOS.SALTO_LINEA);
            bytes.push(...COMANDOS.NEGRITA_OFF);
        }
    }

    bytes.push(...textoABytes('-'.repeat(ANCHO_TICKET)));
    bytes.push(...COMANDOS.SALTO_LINEA);

    // Fase 1: sin ITBIS — solo Total Neto, sin desglose de subtotal/impuesto
    bytes.push(...COMANDOS.NEGRITA_ON);
    bytes.push(...textoABytes(filaItemEscPos(1, 'TOTAL', venta.total).replace('1x ', '')));
    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(...COMANDOS.NEGRITA_OFF);

    bytes.push(...COMANDOS.ALINEAR_CENTRO);
    bytes.push(...textoABytes('-'.repeat(ANCHO_TICKET)));
    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(...textoABytes('Gracias por su compra'));
    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(...textoABytes('Sin distincion de persona'));
    bytes.push(...COMANDOS.SALTO_LINEA);

    // 3) REDES SOCIALES — pie del ticket
    bytes.push(...COMANDOS.NEGRITA_ON);
    bytes.push(...textoABytes('Siguenos en IG: @marun_burger10'));
    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(...COMANDOS.NEGRITA_OFF);

    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(...COMANDOS.SALTO_LINEA);
    bytes.push(...COMANDOS.CORTE_PAPEL);

    return new Uint8Array(bytes);
}

// --- Envío vía Web Bluetooth (impresoras BLE ESC/POS genéricas) -------------
// Nota: el navegador tipa `Navigator` sin la API experimental Web Bluetooth,
// así que se declara aquí una forma mínima de lo que realmente se usa, en
// vez de castear a `any` (evita perder el chequeo de tipos del resto del código).
interface DispositivoBluetoothGatt {
    connect(): Promise<{
        getPrimaryService(uuid: string): Promise<{
            getCharacteristic(uuid: string): Promise<{ writeValue(data: Uint8Array): Promise<void> }>;
        }>;
    }>;
}
interface NavegadorConBluetooth extends Navigator {
    bluetooth: {
        requestDevice(options: { filters: { services: string[] }[] }): Promise<{ gatt: DispositivoBluetoothGatt }>;
    };
}

const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb'; // UUID común en impresoras térmicas BLE
const CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

export async function imprimirViaBluetooth(venta: VentaLocal, numeroOrden: number): Promise<void> {
    if (!('bluetooth' in navigator)) {
        throw new Error('Web Bluetooth no está disponible en este dispositivo/navegador.');
    }

    const navegadorBluetooth = navigator as NavegadorConBluetooth;
    const dispositivo = await navegadorBluetooth.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
    });

    const servidor = await dispositivo.gatt.connect();
    const servicio = await servidor.getPrimaryService(SERVICE_UUID);
    const caracteristica = await servicio.getCharacteristic(CHARACTERISTIC_UUID);

    const comandos = generarComandosEscPos(venta, numeroOrden);

    // Enviar en chunks (la mayoría de impresoras BLE limitan a ~180-512 bytes por escritura)
    const CHUNK_SIZE = 180;
    for (let i = 0; i < comandos.length; i += CHUNK_SIZE) {
        const chunk = comandos.slice(i, i + CHUNK_SIZE);
        await caracteristica.writeValue(chunk);
    }
}

// --- Función orquestadora: intenta impresora física, si falla usa el navegador

export async function imprimirTicket(venta: VentaLocal, numeroOrden: number): Promise<void> {
    try {
        await imprimirViaBluetooth(venta, numeroOrden);
    } catch (err) {
        console.warn('[TicketPrinter] Impresión Bluetooth falló, usando fallback navegador:', err);
        imprimirViaNavegador(venta, numeroOrden);
    }
}
