import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
}

export default function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 4,
}: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, var(--panel) 0%, rgba(255,255,255,0.08) 50%, var(--panel) 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-loading 1.5s ease-in-out infinite',
      }}
    />
  );
}
