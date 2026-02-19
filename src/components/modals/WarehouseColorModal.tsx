'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { X, Save, Palette } from 'lucide-react';

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
        await fetch('/api/warehouse-colors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(color)
        });
      }
      alert('Colores guardados correctamente');
      onSave();
      onClose();
    } catch (error) {
      alert('Error al guardar los colores');
    }
    setSaving(false);
  }

  function updateColor(code: string, field: 'color' | 'text_color', value: string) {
    setColors(prev => prev.map(c => 
      c.warehouse_code === code ? { ...c, [field]: value } : c
    ));
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
                  <div key={wh.warehouse_code} style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr 200px 200px',
                    gap: 12,
                    alignItems: 'center',
                    padding: 12,
                    background: 'var(--panel)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {wh.warehouse_code}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {wh.warehouse_name}
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                        Color de Fondo
                      </label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="color"
                          value={wh.color}
                          onChange={(e) => {
                            updateColor(wh.warehouse_code, 'color', e.target.value);
                            // Auto-ajustar color de texto según el brillo del fondo
                            const textColor = isLightColor(e.target.value) ? '#000000' : '#FFFFFF';
                            updateColor(wh.warehouse_code, 'text_color', textColor);
                          }}
                          style={{
                            width: 50,
                            height: 36,
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        />
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {DEFAULT_COLORS.slice(0, 6).map((preset) => (
                            <button
                              key={preset.color}
                              onClick={() => {
                                updateColor(wh.warehouse_code, 'color', preset.color);
                                const textColor = isLightColor(preset.color) ? '#000000' : '#FFFFFF';
                                updateColor(wh.warehouse_code, 'text_color', textColor);
                              }}
                              title={preset.name}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 4,
                                background: preset.color,
                                border: wh.color === preset.color ? '2px solid white' : '1px solid rgba(255,255,255,0.2)',
                                cursor: 'pointer',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                        Color de Texto
                      </label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="color"
                          value={wh.text_color}
                          onChange={(e) => updateColor(wh.warehouse_code, 'text_color', e.target.value)}
                          style={{
                            width: 50,
                            height: 36,
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        />
                        <div
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: wh.color,
                            color: wh.text_color,
                            borderRadius: 6,
                            textAlign: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          Vista Previa
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
      `}</style>
    </div>
  );
}
