'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Barcode,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  Loader2,
  PackageCheck,
  RefreshCw,
  ScanLine,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import Link from 'next/link';
import styles from './WarehouseSerialScanner.module.css';

type UnknownRecord = Record<string, unknown>;

type PickOrder = {
  id: string;
  salesOrderNumber: string;
  customerName: string;
  warehouseName: string;
  status: string;
  statusLabel: string;
};

type PickItem = {
  id: string;
  itemId: string;
  description: string;
  sku: string;
  quantity: number;
  serialsRequired: boolean;
  serials: string[];
};

type ScanPayload = {
  pickOrder: PickOrder;
  items: PickItem[];
};

type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitSerials(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((serial) => text(serial)).filter(Boolean);
  }

  return text(value)
    .split(/[\n,;|]+/)
    .map((serial) => serial.trim())
    .filter(Boolean);
}

function normalizeResponse(value: unknown): ScanPayload {
  const root = record(value);
  const rawOrder = record(root.pick_order ?? root.pickOrder);
  const rawItems = Array.isArray(root.items) ? root.items : [];
  const warehouse = record(rawOrder.warehouse);
  const customer = record(rawOrder.customer);

  return {
    pickOrder: {
      id: text(rawOrder.id),
      salesOrderNumber: text(rawOrder.sales_order_number ?? rawOrder.order_number) || 'Orden sin número',
      customerName: text(rawOrder.customer_name ?? customer.name) || 'Cliente no indicado',
      warehouseName: text(rawOrder.warehouse_name ?? warehouse.name ?? warehouse.code) || 'Bodega no indicada',
      status: text(rawOrder.status),
      statusLabel: text(rawOrder.status_label) || text(rawOrder.status) || 'En alistamiento',
    },
    items: rawItems.map((rawValue, index) => {
      const rawItem = record(rawValue);
      const serials = splitSerials(
        rawItem.serial_numbers_selected
        ?? rawItem.selected_serials
        ?? rawItem.serial_numbers
        ?? rawItem.serials
      );

      return {
        id: text(rawItem.id ?? rawItem.pick_order_item_id) || `line-${index}`,
        itemId: text(rawItem.item_id),
        description: text(rawItem.description ?? rawItem.item_name ?? rawItem.name) || `Artículo ${index + 1}`,
        sku: text(rawItem.sku),
        quantity: Math.max(0, number(rawItem.quantity, 0)),
        serialsRequired: rawItem.serials_required !== false,
        serials,
      };
    }),
  };
}

async function parseResponse(response: Response): Promise<UnknownRecord> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const data = record(payload);
    throw new Error(text(data.error ?? data.message) || 'No se pudo completar la operación.');
  }
  return record(payload);
}

function itemProgress(item: PickItem): number {
  if (!item.serialsRequired || item.quantity <= 0) return 100;
  return Math.min(100, Math.round((item.serials.length / item.quantity) * 100));
}

export default function WarehouseSerialScanner({ token }: { token: string }) {
  const [data, setData] = useState<ScanPayload | null>(null);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingCode, setDeletingCode] = useState('');
  const [markingReady, setMarkingReady] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const lastDetectionRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const selectedItemIdRef = useRef('');
  const submittingRef = useRef(false);
  const dataRef = useRef<ScanPayload | null>(null);

  const selectedItem = useMemo(
    () => data?.items.find((item) => item.id === selectedItemId) ?? null,
    [data, selectedItemId]
  );

  const serialItems = useMemo(
    () => data?.items.filter((item) => item.serialsRequired) ?? [],
    [data]
  );

  const totals = useMemo(() => {
    const required = serialItems.reduce((sum, item) => sum + item.quantity, 0);
    const scanned = serialItems.reduce((sum, item) => sum + Math.min(item.serials.length, item.quantity), 0);
    return {
      required,
      scanned,
      percent: required > 0 ? Math.min(100, Math.round((scanned / required) * 100)) : 100,
      complete: serialItems.every((item) => item.serials.length === item.quantity),
    };
  }, [serialItems]);

  useEffect(() => {
    selectedItemIdRef.current = selectedItemId;
  }, [selectedItemId]);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const applyPayload = useCallback((payload: ScanPayload) => {
    setData(payload);
    setSelectedItemId((current) => {
      if (payload.items.some((item) => item.id === current)) return current;
      return payload.items.find((item) => item.serialsRequired && item.serials.length < item.quantity)?.id
        ?? payload.items.find((item) => item.serialsRequired)?.id
        ?? payload.items[0]?.id
        ?? '';
    });
  }, []);

  const loadOrder = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/warehouse/picking/scan?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      applyPayload(normalizeResponse(await parseResponse(response)));
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo cargar la orden.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyPayload, token]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const addSerial = useCallback(async (rawCode: string) => {
    const serialCode = rawCode.trim();
    const itemId = selectedItemIdRef.current;
    if (!serialCode || !itemId || submittingRef.current) return;

    const currentItem = dataRef.current?.items.find((item) => item.id === itemId);
    if (!currentItem) return;
    if (currentItem.serials.some((serial) => serial.toLowerCase() === serialCode.toLowerCase())) {
      setMessage({ type: 'error', text: `El serial ${serialCode} ya fue escaneado en esta línea.` });
      return;
    }
    if (currentItem.serials.length >= currentItem.quantity) {
      setMessage({ type: 'error', text: 'Esta línea ya tiene todos los seriales requeridos.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch('/api/warehouse/picking/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pick_order_item_id: itemId, serial_code: serialCode }),
      });
      await parseResponse(response);
      setData((current) => current ? {
        ...current,
        items: current.items.map((item) => item.id === itemId
          ? { ...item, serials: [...item.serials, serialCode] }
          : item),
      } : current);
      setManualCode('');
      setMessage({ type: 'success', text: `Serial ${serialCode} agregado.` });
      navigator.vibrate?.(80);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo agregar el serial.' });
      navigator.vibrate?.([120, 70, 120]);
    } finally {
      setSubmitting(false);
    }
  }, [token]);

  const removeSerial = useCallback(async (itemId: string, serialCode: string) => {
    setDeletingCode(`${itemId}:${serialCode}`);
    setMessage(null);
    try {
      const response = await fetch('/api/warehouse/picking/scan', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pick_order_item_id: itemId, serial_code: serialCode }),
      });
      await parseResponse(response);
      setData((current) => current ? {
        ...current,
        items: current.items.map((item) => item.id === itemId
          ? { ...item, serials: item.serials.filter((serial) => serial !== serialCode) }
          : item),
      } : current);
      setMessage({ type: 'success', text: `Serial ${serialCode} eliminado.` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo eliminar el serial.' });
    } finally {
      setDeletingCode('');
    }
  }, [token]);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const detectFrame = useCallback(async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || !streamRef.current) return;

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !submittingRef.current) {
      try {
        const codes = await detector.detect(video);
        const code = text(codes[0]?.rawValue);
        const now = Date.now();
        if (code && (lastDetectionRef.current.code !== code || now - lastDetectionRef.current.at > 1800)) {
          lastDetectionRef.current = { code, at: now };
          await addSerial(code);
        }
      } catch {
        // Some browsers reject individual frames while the camera is initializing.
      }
    }
    frameRef.current = requestAnimationFrame(() => void detectFrame());
  }, [addSerial]);

  const startCamera = useCallback(async () => {
    setMessage(null);
    try {
      const Detector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      if (!Detector || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador no permite escaneo automático. Usa la entrada manual.');
      }
      detectorRef.current = new Detector({
        formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'data_matrix'],
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      frameRef.current = requestAnimationFrame(() => void detectFrame());
    } catch (error) {
      stopCamera();
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo abrir la cámara.' });
    }
  }, [detectFrame, stopCamera]);

  useEffect(() => {
    setCameraSupported(Boolean(
      typeof window !== 'undefined'
      && (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
      && navigator.mediaDevices?.getUserMedia
    ));
    return stopCamera;
  }, [stopCamera]);

  const submitManual = (event: FormEvent) => {
    event.preventDefault();
    void addSerial(manualCode);
  };

  const markReady = async () => {
    if (!totals.complete || markingReady) return;
    setMarkingReady(true);
    setMessage(null);
    try {
      const response = await fetch('/api/warehouse/picking/scan/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const payload = await parseResponse(response);
      stopCamera();
      setData((current) => current ? {
        ...current,
        pickOrder: {
          ...current.pickOrder,
          status: text(payload.status) || 'ready',
          statusLabel: text(payload.status_label) || 'Lista',
        },
      } : current);
      setMessage({ type: 'success', text: 'Orden marcada como lista para facturación.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo marcar la orden como lista.' });
    } finally {
      setMarkingReady(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.centerState}>
        <Loader2 className={styles.spin} size={28} />
        <strong>Cargando orden de alistamiento</strong>
        <span>Validando el acceso y las líneas del pedido.</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.centerState}>
        <AlertCircle size={34} />
        <strong>No se pudo abrir la orden</strong>
        <span>{message?.text || 'El enlace puede haber expirado o no ser válido.'}</span>
        <button className={styles.primaryButton} onClick={() => void loadOrder()}>
          <RefreshCw size={18} /> Reintentar
        </button>
      </div>
    );
  }

  const isReady = data.pickOrder.status === 'ready';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href="/alistamiento" className={styles.iconButton} aria-label="Volver al alistamiento">
            <ArrowLeft size={20} />
          </Link>
          <div className={styles.titleBlock}>
            <span className={styles.eyebrow}>Escaneo de bodega</span>
            <h1>{data.pickOrder.salesOrderNumber}</h1>
          </div>
          <button
            className={styles.iconButton}
            onClick={() => void loadOrder(true)}
            disabled={refreshing}
            aria-label="Actualizar orden"
          >
            <RefreshCw size={19} className={refreshing ? styles.spin : undefined} />
          </button>
        </div>

        <div className={styles.orderMeta}>
          <span><PackageCheck size={15} /> {data.pickOrder.customerName}</span>
          <span><Warehouse size={15} /> {data.pickOrder.warehouseName}</span>
        </div>

        <div className={styles.totalProgress}>
          <div className={styles.progressNumbers}>
            <strong>{totals.scanned} / {totals.required}</strong>
            <span>{isReady ? 'Orden lista' : 'Seriales escaneados'}</span>
            <b>{totals.percent}%</b>
          </div>
          <div className={styles.progressTrack}>
            <span style={{ width: `${totals.percent}%` }} />
          </div>
        </div>
      </header>

      {message && (
        <div className={`${styles.notice} ${message.type === 'success' ? styles.noticeSuccess : styles.noticeError}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} aria-label="Cerrar mensaje"><X size={16} /></button>
        </div>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.step}>Paso 1</span>
            <h2>Selecciona la línea</h2>
          </div>
          <span className={styles.statusPill}>{data.pickOrder.statusLabel}</span>
        </div>

        <div className={styles.itemList}>
          {data.items.map((item) => {
            const complete = !item.serialsRequired || item.serials.length === item.quantity;
            const selected = item.id === selectedItemId;
            return (
              <button
                key={item.id}
                className={`${styles.itemCard} ${selected ? styles.itemCardSelected : ''}`}
                onClick={() => setSelectedItemId(item.id)}
                type="button"
              >
                <span className={`${styles.itemState} ${complete ? styles.itemStateComplete : ''}`}>
                  {complete ? <Check size={17} /> : <Barcode size={17} />}
                </span>
                <span className={styles.itemInfo}>
                  <strong>{item.description}</strong>
                  <small>{item.sku ? `SKU ${item.sku}` : item.serialsRequired ? 'Requiere serial' : 'Sin seriales'}</small>
                  <span className={styles.miniTrack}>
                    <span style={{ width: `${itemProgress(item)}%` }} />
                  </span>
                </span>
                <span className={styles.itemCount}>{item.serials.length}<small>/{item.quantity}</small></span>
              </button>
            );
          })}
        </div>
      </section>

      {selectedItem && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.step}>Paso 2</span>
              <h2>Escanea los seriales</h2>
            </div>
            <span className={styles.lineCounter}>{selectedItem.serials.length} de {selectedItem.quantity}</span>
          </div>

          <div className={`${styles.cameraBox} ${cameraOn ? styles.cameraBoxActive : ''}`}>
            <video ref={videoRef} muted playsInline aria-label="Vista de cámara para escanear códigos" />
            {!cameraOn && (
              <div className={styles.cameraPlaceholder}>
                <ScanLine size={42} />
                <strong>{cameraSupported ? 'Cámara lista para escanear' : 'Escaneo manual disponible'}</strong>
                <span>{cameraSupported ? 'Apunta al código de barra o QR del equipo.' : 'Tu navegador no soporta detección automática.'}</span>
              </div>
            )}
            {cameraOn && <div className={styles.scanTarget}><span /></div>}
          </div>

          <button
            className={cameraOn ? styles.secondaryButton : styles.cameraButton}
            onClick={cameraOn ? stopCamera : () => void startCamera()}
            type="button"
          >
            {cameraOn ? <CameraOff size={19} /> : <Camera size={19} />}
            {cameraOn ? 'Cerrar cámara' : 'Abrir cámara'}
          </button>

          <div className={styles.divider}><span>o ingresa manualmente</span></div>

          <form className={styles.manualForm} onSubmit={submitManual}>
            <label htmlFor="serial-code">Serial o IMEI</label>
            <div>
              <input
                id="serial-code"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="Escanea o escribe el código"
                autoComplete="off"
                inputMode="numeric"
                disabled={submitting || isReady}
              />
              <button
                type="submit"
                disabled={!manualCode.trim() || submitting || isReady || selectedItem.serials.length >= selectedItem.quantity}
                aria-label="Agregar serial"
              >
                {submitting ? <Loader2 className={styles.spin} size={20} /> : <Check size={20} />}
              </button>
            </div>
          </form>

          <div className={styles.serialList}>
            <div className={styles.serialListHeader}>
              <strong>Seriales registrados</strong>
              <span>{selectedItem.serials.length}</span>
            </div>
            {selectedItem.serials.length === 0 ? (
              <div className={styles.emptySerials}>
                <Barcode size={24} />
                <span>Aún no hay seriales en esta línea.</span>
              </div>
            ) : (
              selectedItem.serials.map((serial, index) => {
                const deleteKey = `${selectedItem.id}:${serial}`;
                return (
                  <div className={styles.serialRow} key={`${serial}-${index}`}>
                    <span className={styles.serialIndex}>{index + 1}</span>
                    <code>{serial}</code>
                    <button
                      onClick={() => void removeSerial(selectedItem.id, serial)}
                      disabled={Boolean(deletingCode) || isReady}
                      aria-label={`Eliminar serial ${serial}`}
                      type="button"
                    >
                      {deletingCode === deleteKey
                        ? <Loader2 className={styles.spin} size={17} />
                        : <Trash2 size={17} />}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <div>
          <strong>{totals.complete ? 'Pedido completo' : `${totals.required - totals.scanned} seriales pendientes`}</strong>
          <span>{totals.complete ? 'Ya puede enviarse a facturación.' : 'Completa todas las líneas para continuar.'}</span>
        </div>
        <button
          className={styles.readyButton}
          disabled={!totals.complete || markingReady || isReady}
          onClick={() => void markReady()}
          type="button"
        >
          {markingReady
            ? <Loader2 className={styles.spin} size={20} />
            : <PackageCheck size={20} />}
          {isReady ? 'Orden lista' : 'Marcar lista'}
        </button>
      </footer>
    </div>
  );
}
