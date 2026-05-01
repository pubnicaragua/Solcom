import { NextRequest, NextResponse } from 'next/server';

interface Waypoint {
  location: {
    latLng: {
      latitude: number;
      longitude: number;
    };
  };
  via?: boolean;
}

interface OptimizeRouteRequest {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  waypoints: Array<{ lat: number; lng: number; address?: string }>;
  vehicleType?: 'car' | 'truck';
  departureTime?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: OptimizeRouteRequest = await request.json();
    const { origin, destination, waypoints, vehicleType = 'car', departureTime } = body;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google Maps API Key no configurada' },
        { status: 500 }
      );
    }

    // Construir waypoints para Google Routes API
    const formattedWaypoints: Waypoint[] = waypoints.map(wp => ({
      location: {
        latLng: {
          latitude: wp.lat,
          longitude: wp.lng
        }
      }
    }));

    // Llamar a Google Routes API
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs,routes.optimizedIntermediateWaypointIndex'
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: origin.lat,
              longitude: origin.lng
            }
          }
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.lat,
              longitude: destination.lng
            }
          }
        },
        intermediates: formattedWaypoints,
        travelMode: vehicleType === 'truck' ? 'DRIVE' : 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: false,
        optimizeWaypointOrder: true,
        routeModifiers: {
          avoidTolls: false,
          avoidHighways: false,
          avoidFerries: false
        },
        languageCode: 'es-NI',
        units: 'METRIC'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Routes API Error:', errorText);
      return NextResponse.json(
        { error: 'Error al optimizar ruta con Google Maps', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron rutas disponibles' },
        { status: 404 }
      );
    }

    const route = data.routes[0];
    
    // Formatear respuesta
    const optimizedRoute = {
      distance: route.distanceMeters,
      duration: route.duration,
      polyline: route.polyline?.encodedPolyline,
      optimizedOrder: Array.isArray(route.optimizedIntermediateWaypointIndex)
        ? route.optimizedIntermediateWaypointIndex
        : waypoints.map((_, index) => index),
      legs: route.legs?.map((leg: any) => ({
        distance: leg.distanceMeters,
        duration: leg.duration,
        startLocation: leg.startLocation?.latLng,
        endLocation: leg.endLocation?.latLng
      })),
      summary: {
        totalDistance: `${(route.distanceMeters / 1000).toFixed(2)} km`,
        totalDuration: formatDuration(route.duration),
        estimatedArrival: calculateArrival(departureTime, route.duration)
      }
    };

    return NextResponse.json({
      success: true,
      route: optimizedRoute
    });

  } catch (error) {
    console.error('Error optimizing route:', error);
    return NextResponse.json(
      { error: 'Error interno al procesar la ruta' },
      { status: 500 }
    );
  }
}

function formatDuration(duration: string): string {
  // Duration viene en formato "1234s"
  const seconds = parseInt(duration.replace('s', ''));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function calculateArrival(departureTime: string | undefined, duration: string): string {
  if (!departureTime) {
    const now = new Date();
    const seconds = parseInt(duration.replace('s', ''));
    now.setSeconds(now.getSeconds() + seconds);
    return now.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
  }
  
  const departure = new Date(departureTime);
  const seconds = parseInt(duration.replace('s', ''));
  departure.setSeconds(departure.getSeconds() + seconds);
  return departure.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
}
