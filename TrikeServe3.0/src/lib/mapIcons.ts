/** Build the shared restaurant pin used by every map that shows a shop. */
export function createRestaurantMarkerIcon(size = 40): google.maps.Icon | undefined {
  const maps = typeof window !== "undefined" ? (window as any)?.google?.maps : undefined;
  if (!maps?.Size || !maps?.Point) return undefined;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z" fill="#16a34a" stroke="white" stroke-width="1"/><path d="M9 5.8v3.8m-1.6-3.8v2.7c0 .9.7 1.6 1.6 1.6s1.6-.7 1.6-1.6V5.8M9 10v5.2m5.2-9.4v9.4m0-9.4c-1.2.4-1.9 1.5-1.9 2.7v2.2h1.9" fill="none" stroke="#fff" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new maps.Size(size, size),
    anchor: new maps.Point(size / 2, size),
  };
}

/** Build the person pin used for the customer end of a delivery route. */
export function createCustomerMarkerIcon(size = 40): google.maps.Icon | undefined {
  const maps = typeof window !== "undefined" ? (window as any)?.google?.maps : undefined;
  if (!maps?.Size || !maps?.Point) return undefined;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z" fill="#2563eb" stroke="white" stroke-width="1"/><circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF"/><path d="M8.7 15.9c.55-2.05 2.15-3.3 3.3-3.3s2.75 1.25 3.3 3.3" fill="#FFFFFF"/></svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new maps.Size(size, size),
    anchor: new maps.Point(size / 2, size),
  };
}
