// Declaraciones de tipos para Google Maps API
// Esto evita errores de TypeScript cuando google no está definido

declare global {
  interface Window {
    google: typeof google;
  }
}

declare namespace google {
  namespace maps {
    class Map {
      constructor(mapDiv: Element, opts?: MapOptions);
      fitBounds(bounds: LatLngBounds | LatLngBoundsLiteral): void;
      setZoom(zoom: number): void;
      setCenter(latlng: LatLng | LatLngLiteral): void;
    }

    class Marker {
      constructor(opts?: MarkerOptions);
      setMap(map: Map | null): void;
      addListener(eventName: string, handler: Function): void;
    }

    class InfoWindow {
      constructor(opts?: InfoWindowOptions);
      open(map: Map, anchor?: Marker): void;
      close(): void;
    }

    class Polyline {
      constructor(opts?: PolylineOptions);
      setMap(map: Map | null): void;
    }

    class LatLngBounds {
      constructor();
      extend(point: LatLng | LatLngLiteral): void;
    }

    class LatLng {
      constructor(lat: number, lng: number);
    }

    interface MapOptions {
      center?: LatLng | LatLngLiteral;
      zoom?: number;
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
      zoomControl?: boolean;
      styles?: any[];
    }

    interface MarkerOptions {
      position?: LatLng | LatLngLiteral;
      map?: Map;
      title?: string;
      label?: string | MarkerLabel;
      icon?: string | Icon | Symbol;
    }

    interface MarkerLabel {
      text: string;
      color?: string;
      fontWeight?: string;
    }

    interface Icon {
      url: string;
      scaledSize?: Size;
    }

    interface Symbol {
      path: any;
      scale?: number;
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeWeight?: number;
      rotation?: number;
    }

    interface Size {
      width: number;
      height: number;
    }

    interface InfoWindowOptions {
      content?: string | Element;
    }

    interface PolylineOptions {
      path?: LatLng[] | LatLngLiteral[];
      geodesic?: boolean;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
      map?: Map;
    }

    interface LatLngLiteral {
      lat: number;
      lng: number;
    }

    interface LatLngBoundsLiteral {
      east: number;
      north: number;
      south: number;
      west: number;
    }

    namespace geometry {
      namespace encoding {
        function decodePath(encodedPath: string): LatLng[];
      }
    }

    enum SymbolPath {
      CIRCLE = 0,
      FORWARD_CLOSED_ARROW = 1,
      FORWARD_OPEN_ARROW = 2,
      BACKWARD_CLOSED_ARROW = 3,
      BACKWARD_OPEN_ARROW = 4
    }
  }
}

export {};
