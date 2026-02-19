'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { X, Save, Palette, Check } from 'lucide-react';

interface WarehouseColorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

interface WarehouseColor {
  warehouse_code: string;
  warehouse_name: string;
  color: string;
  text_color: string;
}

const DEFAULT_COLORS = [
  { color: '#3B82F6', name: 'Azul' },
  { color: '#8B5CF6', name: 'Púrpura' },
  { color: '#10B981', name: 'Verde' },
  { color: '#F59E0B', name: 'Ámbar' },
  { color: '#EF4444', name: 'Rojo' },
  { color: '#EC4899', name: 'Rosa' },
  { color: '#14B8A6', name: 'Teal' },
  { color: '#F97316', name: 'Naranja' },
  { color: '#6366F1', name: 'Índigo' },
  { color: '#84CC16', name: 'Lima' },
  { color: '#06B6D4', name: 'Cian' },
  { color: '#A855F7', name: 'Violeta' },
];

const TEXT_COLOR_PRESETS = [
  { color: '#FFFFFF', name: 'Blanco' },
  { color: '#E5E7EB', name: 'Gris claro' },
  { color: '#111827', name: 'Negro' },
  { color: '#FDE68A', name: 'Dorado suave' },
];

export default function WarehouseColorModal({ isOpen, onClose, onSave }: WarehouseColorModalProps) {
  const [colors, setColors] = useState<WarehouseColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadColors();
    }
  }, [isOpen]);

  async function loadColors() {
    setLoading(true);
    try {
      const response = await fetch('/api/warehouse-colors');
      if (response.ok) {
        const data = await response.json();
        setColors(data);
      }
    } catch (error) {
      console.error('Error loading colors:', error);
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const color of colors) {
        const response = await fetch('/api/warehouse-colors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(color)
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || 'No se pudo guardar la configuración de colores');
        }
      }
      alert('Colores guardados correctamente');
      onSave();
      onClose();
    } catch (error: any) {
      alert(error?.message || 'Error al guardar los colores');
    }
    setSaving(false);
  }

  function updateColor(code: string, field: 'color' | 'text_color', value: string) {
    setColors(prev => prev.map(c => 
      c.warehouse_code === code ? { ...c, [field]: value } : c
    ));
  }

  function applyBackgroundColor(code: string, value: string) {
    updateColor(code, 'color', value);
    const textColor = isLightColor(value) ? '#111827' : '#FFFFFF';
    updateColor(code, 'text_color', textColor);
  }

  function normalizeHex(value: string, fallback: string): string {
    const cleaned = value.trim().replace('#', '').toUpperCase();
    if (/^[0-9A-F]{6}$/.test(cleaned)) return `#${cleaned}`;
    return fallback.toUpperCase();
  }

  function isLightColor(hexColor: string): boolean {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 155;
  }

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20,
    }}>
      <Card style={{ 
        width: '100%', 
        maxWidth: 900, 
        maxHeight: '90vh', 
        overflow: 'auto',
        animation: 'slideIn 0.2s ease-out'
      }}>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Palette size={24} color="var(--brand-primary)" />
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Configurar Colores de Bodegas</h2>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              Cargando configuración...
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16, padding: 12, background: 'var(--panel)', borderRadius: 8 }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                  Personaliza los colores de las columnas de bodegas en la tabla de inventario. 
                  Los colores se aplicarán a todos los usuarios del sistema.
                </p>
              </div>

              <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
                {colors.map((wh) => (
                  <div
                    key={wh.warehouse_code}
                    className="warehouse-color-grid"
                    style={{
                    display: 'grid',
                    gridTemplateColumns: '220px 1fr',
                    gap: 12,
                    padding: 12,
                    background: 'var(--panel)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                  }}
                  >
                    <div style={{ display: 'grid', alignContent: 'start', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                          {wh.warehouse_code}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {wh.warehouse_name}
                        </div>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: wh.color,
                          color: wh.text_color,
                          padding: '10px 12px',
                          fontWeight: 700,
                          fontSize: 12,
                          textAlign: 'center',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                        }}
                      >
                        Vista previa
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{
                        padding: 10,
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(15, 23, 42, 0.35)',
                      }}>
                        <label style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, display: 'block', fontWeight: 600 }}>
                          Color de Fondo
                        </label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                          <label
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 10,
                              border: '1px solid rgba(255,255,255,0.18)',
                              background: wh.color,
                              position: 'relative',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              flexShrink: 0,
                            }}
                            title="Elegir color personalizado"
                          >
                            <input
                              type="color"
                              value={wh.color}
                              onChange={(e) => applyBackgroundColor(wh.warehouse_code, e.target.value)}
                              style={{
                                opacity: 0,
                                width: '100%',
                                height: '100%',
                                cursor: 'pointer',
                              }}
                            />
                          </label>
                          <input
                            key={`${wh.warehouse_code}-bg-${wh.color}`}
                            defaultValue={wh.color.toUpperCase()}
                            onBlur={(e) => applyBackgroundColor(wh.warehouse_code, normalizeHex(e.target.value, wh.color))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                applyBackgroundColor(wh.warehouse_code, normalizeHex((e.target as HTMLInputElement).value, wh.color));
                              }
                            }}
                            maxLength={7}
                            style={{
                              height: 38,
                              width: 110,
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              background: 'var(--panel)',
                              color: 'var(--text)',
                              fontSize: 12,
                              fontWeight: 700,
                              padding: '0 10px',
                              textTransform: 'uppercase',
                              fontFamily: 'monospace',
                            }}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const auto = isLightColor(wh.color) ? '#111827' : '#FFFFFF';
                              updateColor(wh.warehouse_code, 'text_color', auto);
                            }}
                          >
                            Auto texto
                          </Button>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {DEFAULT_COLORS.map((preset) => {
                            const selected = wh.color.toUpperCase() === preset.color;
                            return (
                              <button
                                key={preset.color}
                                type="button"
                                onClick={() => applyBackgroundColor(wh.warehouse_code, preset.color)}
                                title={preset.name}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 8,
                                  background: preset.color,
                                  border: selected ? '2px solid #FFFFFF' : '1px solid rgba(255,255,255,0.22)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  boxShadow: selected ? '0 0 0 2px rgba(59,130,246,0.45)' : 'none',
                                }}
                              >
                                {selected ? <Check size={14} color={isLightColor(preset.color) ? '#111827' : '#FFFFFF'} /> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{
                        padding: 10,
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(15, 23, 42, 0.35)',
                      }}>
                        <label style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, display: 'block', fontWeight: 600 }}>
                          Color de Texto
                        </label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                          <label
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 10,
                              border: '1px solid rgba(255,255,255,0.18)',
                              background: wh.text_color,
                              cursor: 'pointer',
                              overflow: 'hidden',
                              flexShrink: 0,
                            }}
                          >
                            <input
                              type="color"
                              value={wh.text_color}
                              onChange={(e) => updateColor(wh.warehouse_code, 'text_color', e.target.value)}
                              style={{
                                opacity: 0,
                                width: '100%',
                                height: '100%',
                                cursor: 'pointer',
                              }}
                            />
                          </label>
                          <input
                            key={`${wh.warehouse_code}-text-${wh.text_color}`}
                            defaultValue={wh.text_color.toUpperCase()}
                            onBlur={(e) => updateColor(wh.warehouse_code, 'text_color', normalizeHex(e.target.value, wh.text_color))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateColor(wh.warehouse_code, 'text_color', normalizeHex((e.target as HTMLInputElement).value, wh.text_color));
                              }
                            }}
                            maxLength={7}
                            style={{
                              height: 38,
                              width: 110,
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              background: 'var(--panel)',
                              color: 'var(--text)',
                              fontSize: 12,
                              fontWeight: 700,
                              padding: '0 10px',
                              textTransform: 'uppercase',
                              fontFamily: 'monospace',
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {TEXT_COLOR_PRESETS.map((preset) => {
                            const selected = wh.text_color.toUpperCase() === preset.color;
                            return (
                              <button
                                key={preset.color}
                                type="button"
                                onClick={() => updateColor(wh.warehouse_code, 'text_color', preset.color)}
                                title={preset.name}
                                style={{
                                  minWidth: 84,
                                  height: 30,
                                  borderRadius: 8,
                                  background: selected ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                                  border: selected ? '1px solid rgba(96,165,250,0.9)' : '1px solid rgba(255,255,255,0.15)',
                                  color: 'var(--text)',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 4,
                                  cursor: 'pointer',
                                }}
                              >
                                {selected ? <Check size={12} /> : null}
                                {preset.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Cancelar
                </Button>
                <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                  <Save size={16} style={{ marginRight: 6 }} />
                  {saving ? 'Guardando...' : 'Guardar Colores'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 900px) {
          :global(.warehouse-color-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
