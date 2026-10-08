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
   if (typeof window !== 'undefined' && window.google?.maps?.Map) {
     return Promise.resolve();
   }

   if (googleMapsLoaderPromise) {
     return googleMapsLoaderPromise;
   }

   googleMapsLoaderPromise = new Promise((resolve, reject) => {
     // Usamos el sistema oficial de callbacks de Google Maps
     const callbackName = 'initGoogleMapsCallback_' + Math.random().toString(36).substring(7);
     (window as any)[callbackName] = () => {
       resolve();
       delete (window as any)[callbackName];
     };

     const existingScript = document.querySelector('script[data-google-maps-loader="true"]') as HTMLScriptElement | null;

     if (existingScript) {
       // Si el script ya existe (ej. hot reload de React), verificamos periódicamente
       const checkInterval = setInterval(() => {
         if (window.google?.maps?.Map) {
           clearInterval(checkInterval);
           resolve();
         }
       }, 100);
       return;
     }

     const script = document.createElement('script');
     // Agregamos el parámetro callback
     script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&callback=${callbackName}`;
     script.async = true;
     script.defer = true;
     script.dataset.googleMapsLoader = 'true';
     script.onerror = () => reject(new Error('Error de red cargando Google Maps'));
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
        // En lugar de fallar inmediatamente, reintentamos un par de veces
        console.warn('Google Maps no está completamente cargado aún, esperando...');
        setTimeout(initMap, 200);
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
              featureType: 'administrative',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#5c5c5c' }]
            },
            {
              featureType: 'landscape',
              elementType: 'geometry.fill',
              stylers: [{ color: '#edeae2' }]
            },
            {
              featureType: 'poi.park',
              elementType: 'geometry.fill',
              stylers: [{ color: '#c4e2af' }]
            },
            {
              featureType: 'road',
              elementType: 'geometry.fill',
              stylers: [{ color: '#ffffff' }]
            },
            {
              featureType: 'road',
              elementType: 'geometry.stroke',
              stylers: [{ color: '#dcdbd9' }, { weight: 1.5 }]
            },
            {
              featureType: 'road.highway',
              elementType: 'geometry.fill',
              stylers: [{ color: '#ffdf87' }]
            },
            {
              featureType: 'road.highway',
              elementType: 'geometry.stroke',
              stylers: [{ color: '#d9b455' }, { weight: 1.5 }]
            },
            {
              featureType: 'road.arterial',
              elementType: 'geometry.fill',
              stylers: [{ color: '#ffffff' }]
            },
            {
              featureType: 'road.arterial',
              elementType: 'geometry.stroke',
              stylers: [{ color: '#dcdbd9' }, { weight: 1.5 }]
            },
            {
              featureType: 'water',
              elementType: 'geometry.fill',
              stylers: [{ color: '#a1cfff' }]
            },
            {
              featureType: 'transit',
              elementType: 'all',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi',
              elementType: 'all',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.park',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              elementType: 'labels.text.stroke',
              stylers: [{ color: '#ffffff' }, { weight: 4 }]
            },
            {
              elementType: 'labels.text.fill',
              stylers: [{ color: '#444444' }, { weight: 600 }]
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
              color: '#ffffff',
              fontWeight: '700',
              fontFamily: 'Poppins, sans-serif',
              fontSize: '14px'
            } as any
          : undefined,
        icon: markerData.type === 'origin'
          ? {
              // Marcador de origen completamente redondo y cute
              path: maps.SymbolPath.CIRCLE,
              scale: 14,
              fillColor: '#4f46e5', // Corporate Indigo
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 4
            }
          : markerData.type === 'stop'
          ? {
              path: maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: '#ec4899', // Cute Pink
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3
            }
          : markerData.type === 'driver'
          ? {
              path: maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: '#14b8a6', // Cute Teal
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3
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
        background: 'var(--panel-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 40,
        textAlign: 'center'
      }}>
        <AlertCircle size={48} color="#ef4444" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: 14, color: 'var(--danger)', marginBottom: 8, fontWeight: 600 }}>
          Error de configuración
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 400 }}>
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
