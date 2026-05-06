'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

 let googleMapsLoaderPromise: Promise<void> | null = null;

 type GoogleMapsRuntime = any;

interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  type: 'origin' | 'stop' | 'driver';
  sequence?: number;
}

interface GoogleMapViewProps {
  markers?: MapMarker[];
  polyline?: string;
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: string;
}

 function ensureGoogleMapsLoaded(apiKey: string): Promise<void> {
   if (typeof window !== 'undefined' && window.google?.maps) {
     return Promise.resolve();
   }

   if (googleMapsLoaderPromise) {
     return googleMapsLoaderPromise;
   }

   googleMapsLoaderPromise = new Promise((resolve, reject) => {
     const existingScript = document.querySelector('script[data-google-maps-loader="true"]') as HTMLScriptElement | null;

     const finishIfReady = () => {
       if (window.google?.maps) {
         resolve();
         return true;
       }
       return false;
     };

     if (finishIfReady()) {
       return;
     }

     if (existingScript) {
       existingScript.addEventListener('load', () => {
         if (finishIfReady()) return;
         reject(new Error('Google Maps cargó pero no inicializó correctamente'));
       }, { once: true });
       existingScript.addEventListener('error', () => reject(new Error('Error cargando Google Maps')), { once: true });
       return;
     }

     const script = document.createElement('script');
     script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&loading=async`;
     script.async = true;
     script.defer = true;
     script.dataset.googleMapsLoader = 'true';
     script.onload = () => {
       if (finishIfReady()) return;
       reject(new Error('Google Maps cargó pero no inicializó correctamente'));
     };
     script.onerror = () => reject(new Error('Error cargando Google Maps'));
     document.head.appendChild(script);
   });

   return googleMapsLoaderPromise;
 }

export default function GoogleMapView({ 
  markers = [], 
  polyline,
  center = { lat: 12.136389, lng: -86.251389 },
  zoom = 12,
  height = '100%'
}: GoogleMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<GoogleMapsRuntime | null>(null);
  const [error, setError] = useState<string>('');
  const markersRef = useRef<GoogleMapsRuntime[]>([]);
  const polylineRef = useRef<GoogleMapsRuntime | null>(null);

  // Inicializar mapa
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      setError('Google Maps API key no está configurada. Agregá NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en las variables de entorno.');
      return;
    }

    if (!mapRef.current) return;

    const initMap = () => {
      if (!mapRef.current) return;
      const maps = window.google?.maps;
      
      // Validar que Google Maps esté completamente cargado
      if (!maps || !maps.Map) {
        console.error('Google Maps no está completamente cargado');
        setError('Google Maps no se cargó correctamente. Recarga la página.');
        return;
      }

      try {
        const mapInstance = new maps.Map(mapRef.current, {
          center,
          zoom,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          styles: [
            {
              featureType: 'all',
              elementType: 'geometry',
              stylers: [{ color: '#242f3e' }]
            },
            {
              featureType: 'all',
              elementType: 'labels.text.stroke',
              stylers: [{ color: '#242f3e' }]
            },
            {
              featureType: 'all',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#746855' }]
            }
          ]
        });

        setMap(mapInstance);
      } catch (err) {
        console.error('Error inicializando mapa:', err);
        setError('Error inicializando el mapa');
      }
    };

    ensureGoogleMapsLoaded(apiKey)
      .then(() => {
        setError('');
        initMap();
      })
      .catch((err) => {
        console.error('Error cargando Google Maps:', err);
        setError('Error cargando Google Maps. Verificá tu conexión a internet.');
      });
  }, [center.lat, center.lng, zoom]);

  // Actualizar markers
  useEffect(() => {
    const maps = window.google?.maps;
    if (!map || !maps) return;

    // Limpiar markers anteriores
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Crear nuevos markers
    markers.forEach(markerData => {
      const marker = new maps.Marker({
        position: { lat: markerData.lat, lng: markerData.lng },
        map,
        title: markerData.label,
        label: markerData.type === 'stop' && markerData.sequence 
          ? { 
              text: markerData.sequence.toString(), 
              color: 'white',
              fontWeight: 'bold'
            }
          : undefined,
        icon: markerData.type === 'origin'
          ? {
              path: maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: '#22c55e',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2
            }
          : markerData.type === 'driver'
          ? {
              path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 6,
              fillColor: '#3b82f6',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              rotation: 0
            }
          : undefined
      });

      const infoWindow = new maps.InfoWindow({
        content: `<div style="color: #1e293b; padding: 4px;">
          <strong>${markerData.label}</strong>
          ${markerData.sequence ? `<br><small>Parada #${markerData.sequence}</small>` : ''}
        </div>`
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });

      markersRef.current.push(marker);
    });

    // Ajustar bounds si hay markers
    if (markers.length > 0) {
      const bounds = new maps.LatLngBounds();
      markers.forEach(m => bounds.extend({ lat: m.lat, lng: m.lng }));
      map.fitBounds(bounds);
      
      // Ajustar zoom si solo hay un marker
      if (markers.length === 1) {
        map.setZoom(15);
      }
    }
  }, [map, markers]);

  // Actualizar polyline
  useEffect(() => {
    const maps = window.google?.maps;
    if (!map || !maps?.geometry?.encoding) return;

    // Limpiar polyline anterior
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (!polyline) return;

    try {
      const decodedPath = maps.geometry.encoding.decodePath(polyline);
      
      const polylineInstance = new maps.Polyline({
        path: decodedPath,
        geodesic: true,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.8,
        strokeWeight: 4,
        map
      });

      polylineRef.current = polylineInstance;
    } catch (err) {
      console.error('Error decodificando polyline:', err);
    }
  }, [map, polyline]);

  if (error) {
    return (
      <div style={{
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15,23,42,0.5)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: 40,
        textAlign: 'center'
      }}>
        <AlertCircle size={48} color="#ef4444" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: 14, color: '#f87171', marginBottom: 8, fontWeight: 600 }}>
          Error de configuración
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', maxWidth: 400 }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={mapRef} 
      style={{ 
        width: '100%', 
        height,
        borderRadius: 8,
        overflow: 'hidden'
      }} 
    />
  );
}
