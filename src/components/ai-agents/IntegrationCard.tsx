'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

interface IntegrationDocs {
  setup: string[];
  example?: string;
  requirements?: string[];
  apiEndpoint?: string;
}

interface IntegrationCardProps {
  icon: string;
  title: string;
  description: string;
  status: 'available' | 'development' | 'planned';
  docs?: IntegrationDocs;
  estimatedDate?: string;
}

export default function IntegrationCard({
  icon,
  title,
  description,
  status,
  docs,
  estimatedDate,
}: IntegrationCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getStatusColor = () => {
    switch (status) {
      case 'available':
        return 'radial-gradient(ellipse at 100% 0%, color-mix(in srgb, var(--success) 14%, transparent), transparent 48%), var(--card-surface-gradient)';
      case 'development':
        return 'radial-gradient(ellipse at 100% 0%, color-mix(in srgb, var(--warning) 14%, transparent), transparent 48%), var(--card-surface-gradient)';
      case 'planned':
        return 'radial-gradient(ellipse at 100% 0%, color-mix(in srgb, var(--muted) 12%, transparent), transparent 48%), var(--card-surface-gradient)';
    }
  };

  const getStatusBorder = () => {
    switch (status) {
      case 'available':
        return '1px solid color-mix(in srgb, var(--success) 42%, var(--border))';
      case 'development':
        return '1px solid color-mix(in srgb, var(--warning) 42%, var(--border))';
      case 'planned':
        return '1px solid color-mix(in srgb, var(--muted) 42%, var(--border))';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'available':
        return 'Disponible';
      case 'development':
        return `En desarrollo - ${estimatedDate}`;
      case 'planned':
        return 'Próximamente';
    }
  };

  const getStatusTextColor = () => {
    switch (status) {
      case 'available':
        return 'var(--success)';
      case 'development':
        return 'var(--warning)';
      case 'planned':
        return 'var(--muted)';
    }
  };

  return (
    <div
      className={`ai-agent-integration-card${status === 'available' && docs ? ' is-expandable' : ''}`}
      style={{
        padding: '1rem',
        background: getStatusColor(),
        borderRadius: '12px',
        border: getStatusBorder(),
        transition: 'all 0.2s',
        boxShadow: '0 4px 12px var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        cursor: status === 'available' && docs ? 'pointer' : 'default',
      }}
      onClick={() => {
        if (status === 'available' && docs) {
          setExpanded(!expanded);
        }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{icon}</div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            {title}
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            {description}
          </p>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: getStatusTextColor(),
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {getStatusText()}
          </span>
        </div>
        {status === 'available' && docs && (
          <div style={{ marginLeft: '0.5rem' }}>
            {expanded ? (
              <ChevronUp size={20} color="var(--text-secondary)" />
            ) : (
              <ChevronDown size={20} color="var(--text-secondary)" />
            )}
          </div>
        )}
      </div>

      {expanded && docs && status === 'available' && (
        <div
          style={{
            marginTop: '1rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border)',
          }}
        >
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Configuración:
          </h4>
          <ol style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', margin: 0 }}>
            {docs.setup.map((step, index) => (
              <li key={index} style={{ marginBottom: '0.5rem' }}>
                {step}
              </li>
            ))}
          </ol>

          {docs.requirements && (
            <>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.5rem' }}>
                Requisitos:
              </h4>
              <ul style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', margin: 0 }}>
                {docs.requirements.map((req, index) => (
                  <li key={index} style={{ marginBottom: '0.25rem' }}>
                    {req}
                  </li>
                ))}
              </ul>
            </>
          )}

          {docs.apiEndpoint && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: 'var(--overlay)',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                color: 'var(--success)',
              }}
            >
              {docs.apiEndpoint}
            </div>
          )}

          {docs.example && (
            <>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.5rem' }}>
                Ejemplo de uso:
              </h4>
              <pre
                style={{
                  fontSize: '0.75rem',
                  padding: '0.75rem',
                  background: 'var(--overlay)',
                  borderRadius: '4px',
                  overflow: 'auto',
                  margin: 0,
                }}
              >
                {docs.example}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
