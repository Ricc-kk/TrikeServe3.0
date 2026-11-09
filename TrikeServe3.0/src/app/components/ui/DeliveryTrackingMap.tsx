import type { CSSProperties } from "react";
import { MarkerF, Polyline } from "@react-google-maps/api";
import GoogleMap from "@/app/components/ui/ThemedGoogleMap";
import { createDropoffMarkerIcon, createRestaurantMarkerIcon, createTricycleMarkerIcon } from "@/lib/mapIcons";
import { RIDE_MAP_DROPOFF_COLOR, RIDE_MAP_PICKUP_COLOR } from "@/lib/rideMapColors";
import MapTypeToggle from "./MapTypeToggle";

type MapPoint = google.maps.LatLngLiteral;

type DeliveryTrackingMapCamera =
  | { mode: "controlled"; center: MapPoint; zoom: number }
  | { mode: "initial"; defaultCenter: MapPoint; defaultZoom: number };

type DeliveryTrackingMapProps = {
  mapContainerStyle: CSSProperties;
  camera: DeliveryTrackingMapCamera;
  driverLocation?: MapPoint | null;
  restaurantLocation?: MapPoint | null;
  customerLocation?: MapPoint | null;
  routePath?: MapPoint[] | null;
  isHeadingToRestaurant: boolean;
  onLoad?: (map: google.maps.Map) => void;
  onUnmount?: () => void;
  onDragStart?: () => void;
  onZoomChanged?: () => void;
};

/** One delivery tracking map shared by the rider, customer, and business views. */
export default function DeliveryTrackingMap({
  mapContainerStyle,
  camera,
  driverLocation = null,
  restaurantLocation = null,
  customerLocation = null,
  routePath = [],
  isHeadingToRestaurant,
  onLoad,
  onUnmount,
  onDragStart,
  onZoomChanged,
}: DeliveryTrackingMapProps) {
  const cameraProps = camera.mode === "controlled"
    ? { center: camera.center, zoom: camera.zoom }
    : { defaultCenter: camera.defaultCenter, defaultZoom: camera.defaultZoom };

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      {...cameraProps}
      options={{
        disableDefaultUI: true,
        gestureHandling: "greedy",
        disableDoubleClickZoom: true,
      }}
      onLoad={onLoad}
      onUnmount={onUnmount}
      onDragStart={onDragStart}
      onZoomChanged={onZoomChanged}
    >
      <MapTypeToggle />
      {driverLocation && (
        <MarkerF
          position={driverLocation}
          title="Driver"
          icon={createTricycleMarkerIcon()}
          zIndex={100}
        />
      )}
      {restaurantLocation && (
        <MarkerF
          position={restaurantLocation}
          title="Restaurant pickup"
          icon={createRestaurantMarkerIcon()}
          zIndex={isHeadingToRestaurant ? 90 : 70}
        />
      )}
      {customerLocation && (
        <MarkerF
          position={customerLocation}
          title="Customer drop-off"
          icon={createDropoffMarkerIcon()}
          zIndex={isHeadingToRestaurant ? 70 : 90}
        />
      )}
      {routePath && routePath.length > 1 && (
        <Polyline
          path={routePath}
          options={{
            strokeColor: isHeadingToRestaurant ? RIDE_MAP_PICKUP_COLOR : RIDE_MAP_DROPOFF_COLOR,
            strokeWeight: 6,
            strokeOpacity: 0.9,
            zIndex: 10,
          }}
        />
      )}
    </GoogleMap>
  );
}
