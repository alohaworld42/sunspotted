export interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapViewport {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  bounds: ViewportBounds;
}
