import type { CSSProperties } from "react";
import { MarkerF, Polyline } from "@react-google-maps/api";
import GoogleMap from "@/app/components/ui/ThemedGoogleMap";
import { createDropoffMarkerIcon, createTricycleMarkerIcon } from "@/lib/mapIcons";
import { RIDE_MAP_DROPOFF_COLOR, RIDE_MAP_PICKUP_COLOR } from "@/lib/rideMapColors";
import MapTypeToggle from "./MapTypeToggle";
import { terminalMarkerIcon } from "./TerminalIcon";

export type SharedRideMapPoint = { lat: number; lng: number };

export type SharedRideMapDropoff = {
  id: string;
  position: SharedRideMapPoint;
  title: string;
  color?: string;
  stopNumber?: number;
};

type SharedRideRouteMapProps = {
  mapContainerStyle: CSSProperties;
  center: SharedRideMapPoint;
  zoom?: number;
  options?: google.maps.MapOptions;
  driverLocation?: SharedRideMapPoint | null;
  terminalPosition?: SharedRideMapPoint | null;
  terminalMarkerColor?: string;
  terminalRouteColor?: string;
  terminalRoutePaths?: SharedRideMapPoint[][];
  driverToTerminalRoutePath?: SharedRideMapPoint[];
  dropoffs?: SharedRideMapDropoff[];
  onLoad?: (map: google.maps.Map) => void;
  onUnmount?: () => void;
  onDragStart?: () => void;
  onZoomChanged?: () => void;
};

/**
 * Shared live map used by the customer's active share ride and the driver's
 * active ride. Both sides draw the terminal's saved road and the live approach
 * leg with the same map controls, line styling, and markers.
 */
export default function SharedRideRouteMap({
  mapContainerStyle,
  center,
  zoom = 15,
  options,
  driverLocation = null,
  terminalPosition = null,
  terminalMarkerColor,
  terminalRouteColor = "#22C55E",
  terminalRoutePaths = [],
  driverToTerminalRoutePath = [],
  dropoffs = [],
  onLoad,
  onUnmount,
  onDragStart,
  onZoomChanged,
}: SharedRideRouteMapProps) {
  const validTerminalRoutes = terminalRoutePaths.filter(path => path.length > 1);

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={zoom}
      options={{
        zoomControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        clickableIcons: false,
        draggable: true,
        gestureHandling: "greedy",
        ...options,
      }}
      onLoad={onLoad}
      onUnmount={onUnmount}
      onDragStart={onDragStart}
      onZoomChanged={onZoomChanged}
    >
      <MapTypeToggle />
      {validTerminalRoutes.map((path, index) => (
        <Polyline
          key={`terminal-route-underlay-${index}`}
          path={path}
          options={{
            strokeColor: terminalRouteColor,
            strokeOpacity: 0.22,
            strokeWeight: 10,
            geodesic: true,
            clickable: false,
          }}
        />
      ))}
      {validTerminalRoutes.map((path, index) => (
        <Polyline
          key={`terminal-route-${index}`}
          path={path}
          options={{
            strokeColor: terminalRouteColor,
            strokeOpacity: 0.95,
            strokeWeight: 4,
            geodesic: true,
            clickable: false,
          }}
        />
      ))}
      {driverToTerminalRoutePath.length > 1 && (
        <Polyline
          path={driverToTerminalRoutePath}
          options={{
            strokeColor: RIDE_MAP_PICKUP_COLOR,
            strokeOpacity: 0.96,
            strokeWeight: 6,
            geodesic: true,
            clickable: false,
            zIndex: 1000,
          }}
        />
      )}
      {terminalPosition && (
        <MarkerF
          position={terminalPosition}
          title="Terminal"
          icon={terminalMarkerIcon(terminalMarkerColor)}
        />
      )}
      {dropoffs.map(dropoff => (
        <MarkerF
          key={dropoff.id}
          position={dropoff.position}
          title={dropoff.title}
          icon={createDropoffMarkerIcon({
            color: dropoff.color || RIDE_MAP_DROPOFF_COLOR,
            ...(dropoff.stopNumber ? { stopNumber: dropoff.stopNumber } : {}),
          })}
          zIndex={20}
        />
      ))}
      {driverLocation && (
        <MarkerF
          position={driverLocation}
          title="Driver Location"
          icon={createTricycleMarkerIcon()}
          zIndex={100}
        />
      )}
    </GoogleMap>
  );
}
