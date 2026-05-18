import { useEffect, useState, useRef, useCallback } from 'react';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import useMapLoader from '@/lib/mapLoader';
import { Button } from '../ui/button';

export default function CustomerDashboard() {
  const { isLoaded: isMapsLoaded, loadError: mapsLoadError, blocked, apiKeyPresent } = useMapLoader();
  const [mapCenter, setMapCenter] = useState<{lat:number;lng:number}>({ lat: 14.5995, lng: 120.9842 });
  const [selectedMarker, setSelectedMarker] = useState<any>(null);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement|null>(null);
  const [activeRideData, setActiveRideData] = useState<any>(null);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setMapCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, () => {}, { enableHighAccuracy: true });
    }
  }, []);

  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem('trikeserve_active_ride');
        if (raw) setActiveRideData(JSON.parse(raw));
        else setActiveRideData(null);
      } catch (e) { setActiveRideData(null); }
    };
    load();
    const interval = setInterval(load, 2000);
    window.addEventListener('storage', load);
    return () => { clearInterval(interval); window.removeEventListener('storage', load); };
  }, []);

  const coordsFrom = useCallback((r:any) => {
    if (!r) return null;
    if (r.driverLat && r.driverLng) return { lat: r.driverLat, lng: r.driverLng };
    if (r.pickupLat && r.pickupLng) return { lat: r.pickupLat, lng: r.pickupLng };
    if (typeof r.pickup === 'string') {
      const parts = r.pickup.split(',').map((p:string)=>p.trim());
      if (parts.length===2) { const la=Number(parts[0]), lo=Number(parts[1]); if(!isNaN(la)&&!isNaN(lo)) return {lat:la,lng:lo}; }
    }
    return null;
  }, []);

  // auto fullscreen on pickup
  useEffect(() => {
    if (activeRideData && activeRideData.status === 'in-progress' && !isMapFullscreen) {
      try { if (mapContainerRef.current && (mapContainerRef.current as any).requestFullscreen) (mapContainerRef.current as any).requestFullscreen(); setIsMapFullscreen(true); } catch (e) { }
    }
  }, [activeRideData, isMapFullscreen]);

  const toggleFullscreen = async () => {
    try {
      if (!isMapFullscreen) {
        if (mapContainerRef.current && (mapContainerRef.current as any).requestFullscreen) await (mapContainerRef.current as any).requestFullscreen();
        else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        setIsMapFullscreen(true);
      } else {
        if (document.fullscreenElement) await document.exitFullscreen();
        setIsMapFullscreen(false);
      }
    } catch (e) { console.warn(e); }
  };

  return (
    <div className="h-screen relative">
      {(!isMapsLoaded || blocked || !apiKeyPresent) ? (
        <div className="w-full h-full flex items-center justify-center">Map unavailable</div>
      ) : (
        <div ref={mapContainerRef} className={isMapFullscreen ? 'fixed inset-0 z-[2000] bg-white' : 'w-full h-full'}>
          <GoogleMap
            onLoad={(m)=>mapRef.current = m}
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={mapCenter}
            zoom={15}
            options={{ fullscreenControl: true, mapTypeControl: true }}
          >
            <Marker position={mapCenter} title="You" onClick={()=>setSelectedMarker(mapCenter)} />
            {activeRideData && (() => {
              const d = coordsFrom(activeRideData);
              if (!d) return null;
              return <Marker position={d} title={activeRideData.driverName || 'Driver'} icon={{ path:'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z', fillColor:'#E11D48', fillOpacity:1, strokeWeight:0, scale:1.2 }} onClick={()=>setSelectedMarker(d)} />;
            })()}

            {selectedMarker && (
              <InfoWindow position={selectedMarker} onCloseClick={()=>setSelectedMarker(null)}>
                <div>
                  <p className="font-bold">Marker</p>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>

          <div className="absolute top-4 right-4">
            <Button onClick={toggleFullscreen} className="bg-white">{isMapFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}


