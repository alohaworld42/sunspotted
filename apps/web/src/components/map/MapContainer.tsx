import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { useMapStore } from "../../store/mapStore";
import { useAnalysisStore } from "../../store/analysisStore";
import { useTimeStore } from "../../store/timeStore";
import { usePointAnalysis } from "../../hooks/usePointAnalysis";
import { getSunPosition } from "../../lib/sun/position";
import * as turf from "@turf/turf";
import { calculateSimpleShadows } from "../../lib/shadow/projection";
import { effectiveCanopyRadius } from "../../lib/trees/loader";
import type { ShadowPolygon } from "../../types/shadow";
import type { POI, POICategory } from "../../types/poi";

// OpenFreeMap: free, no API key, includes OpenMapTiles vector data with buildings
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

// Esri World Imagery: free satellite tiles, no API key
const SATELLITE_TILES = "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const SHADOW_SOURCE = "analysis-shadows";
const SHADOW_LAYER = "analysis-shadow-layer";
const TREE_SHADOW_SOURCE = "tree-shadows";
const TREE_SHADOW_LAYER = "tree-shadow-layer";
const SATELLITE_SOURCE = "satellite-imagery";
const SATELLITE_LAYER = "satellite-layer";
const BUILDINGS_3D_LAYER = "3d-buildings";

const METERS_PER_DEGREE_LAT = 111_320;

function buildCanopyPoly(center: [number, number], radiusMeters: number, lat: number): Polygon {
  const segments = 12;
  const coords: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    const dx = radiusMeters * Math.cos(angle) / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
    const dy = radiusMeters * Math.sin(angle) / METERS_PER_DEGREE_LAT;
    coords.push([center[0] + dx, center[1] + dy]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

const CATEGORY_ICONS: Record<POICategory, string> = {
  cafe: "\u2615",
  restaurant: "\uD83C\uDF7D\uFE0F",
  beer_garden: "\uD83C\uDF7A",
  park: "\uD83C\uDF33",
};

interface MapContainerProps {
  pois?: POI[];
  onPoiSelect?: (poi: POI) => void;
  satelliteOn?: boolean;
}

export function MapContainer({ pois = [], onPoiSelect, satelliteOn = false }: MapContainerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const pitch = useMapStore((s) => s.pitch);
  const bearing = useMapStore((s) => s.bearing);
  const setCenter = useMapStore((s) => s.setCenter);
  const setZoom = useMapStore((s) => s.setZoom);
  const setBounds = useMapStore((s) => s.setBounds);

  const { analyzePoint } = usePointAnalysis();
  const selectedPoint = useAnalysisStore((s) => s.selectedPoint);
  const analysisShadows = useAnalysisStore((s) => s.analysisShadows);
  const treeShadows = useAnalysisStore((s) => s.treeShadows);
  const analysisBuildings = useAnalysisStore((s) => s.analysisBuildings);
  const analysisTrees = useAnalysisStore((s) => s.analysisTrees);
  const showTreeShadows = useAnalysisStore((s) => s.showTreeShadows);
  const setAnalysisShadows = useAnalysisStore((s) => s.setAnalysisShadows);
  const setTreeShadowsStore = useAnalysisStore((s) => s.setTreeShadows);
  const isAnalyzing = useAnalysisStore((s) => s.isAnalyzing);
  const currentTime = useTimeStore((s) => s.currentTime);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const updateMapState = useCallback((map: maplibregl.Map) => {
    const c = map.getCenter();
    setCenter([c.lng, c.lat]);
    setZoom(map.getZoom());
    const b = map.getBounds();
    if (b) {
      setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    }
  }, [setCenter, setZoom, setBounds]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center,
      zoom,
      pitch,
      bearing,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right",
    );
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    map.on("load", () => {
      const layers = map.getStyle().layers;
      let labelLayerId: string | undefined;
      if (layers) {
        for (const layer of layers) {
          if (layer.type === "symbol" && (layer as maplibregl.SymbolLayerSpecification).layout?.["text-field"]) {
            labelLayerId = layer.id;
            break;
          }
        }
      }

      // Satellite imagery source (hidden initially)
      map.addSource(SATELLITE_SOURCE, {
        type: "raster",
        tiles: [SATELLITE_TILES],
        tileSize: 256,
        attribution: "&copy; Esri",
      });

      map.addLayer(
        {
          id: SATELLITE_LAYER,
          type: "raster",
          source: SATELLITE_SOURCE,
          layout: { visibility: "none" },
        },
        labelLayerId,
      );

      // Shadow source + layer — red overlay for clear visibility
      map.addSource(SHADOW_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer(
        {
          id: SHADOW_LAYER,
          type: "fill",
          source: SHADOW_SOURCE,
          paint: {
            "fill-color": "#cc0000",
            "fill-opacity": 0.4,
            "fill-antialias": true,
          },
        },
        labelLayerId,
      );

      // Tree shadow source + layer — greenish, lower opacity for dappled light
      map.addSource(TREE_SHADOW_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer(
        {
          id: TREE_SHADOW_LAYER,
          type: "fill",
          source: TREE_SHADOW_SOURCE,
          layout: { visibility: "visible" },
          paint: {
            "fill-color": "#2d4a2d",
            "fill-opacity": 0.2,
            "fill-antialias": true,
          },
        },
        labelLayerId,
      );

      // 3D building extrusions from OpenFreeMap vector tiles
      map.addLayer(
        {
          id: BUILDINGS_3D_LAYER,
          source: "openmaptiles",
          "source-layer": "building",
          type: "fill-extrusion",
          minzoom: 14,
          paint: {
            "fill-extrusion-color": "#e0e0e4",
            "fill-extrusion-height": ["get", "render_height"],
            "fill-extrusion-base": ["get", "render_min_height"],
            "fill-extrusion-opacity": 0.75,
          },
        },
        labelLayerId,
      );

      updateMapState(map);
      setMapLoaded(true);

      // Fly to user's geolocation if available
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            map.flyTo({
              center: [pos.coords.longitude, pos.coords.latitude],
              zoom: 15,
              duration: 2000,
            });
          },
          () => { /* denied or error — stay at default */ },
          { enableHighAccuracy: true, timeout: 8000 },
        );
      }
    });

    map.on("moveend", () => updateMapState(map));

    // Click = analyze that point (clear POI name since it's a direct map click)
    map.on("click", (e) => {
      useAnalysisStore.getState().setSelectedPOIName(null);
      analyzePoint([e.lngLat.lng, e.lngLat.lat]);
    });

    map.getCanvas().style.cursor = "crosshair";
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Dynamic sun lighting on 3D buildings
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const [lng, lat] = center;
    const sun = getSunPosition(currentTime, lat, lng);

    if (sun.altitude > 0.01) {
      // suncalc azimuth (from south) → MapLibre light position (from north, degrees)
      const lightAzimuthDeg = ((sun.azimuth * 180) / Math.PI + 180) % 360;
      const lightPolar = Math.max(0, 90 - (sun.altitude * 180) / Math.PI);

      map.setLight({
        anchor: "map",
        position: [1.5, lightAzimuthDeg, lightPolar],
        intensity: 0.6,
        color: "#fff8e7",
      });

      map.setPaintProperty(BUILDINGS_3D_LAYER, "fill-extrusion-color",
        satelliteOn ? "#c8c8d0" : "#e0e0e4");
      map.setPaintProperty(BUILDINGS_3D_LAYER, "fill-extrusion-opacity",
        satelliteOn ? 0.35 : 0.75);
    } else {
      // Night: dim flat lighting
      map.setLight({
        anchor: "viewport",
        position: [1.5, 0, 80],
        intensity: 0.3,
        color: "#c0c8d8",
      });
      map.setPaintProperty(BUILDINGS_3D_LAYER, "fill-extrusion-color",
        satelliteOn ? "#909098" : "#b0b0b8");
      map.setPaintProperty(BUILDINGS_3D_LAYER, "fill-extrusion-opacity",
        satelliteOn ? 0.3 : 0.75);
    }
  }, [currentTime, center, mapLoaded, satelliteOn]);

  // Re-compute shadows when time changes (throttled to avoid lag during animation)
  const shadowThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShadowTimeRef = useRef<number>(0);
  useEffect(() => {
    if (!selectedPoint || analysisBuildings.length === 0) return;

    const now = Date.now();
    const elapsed = now - lastShadowTimeRef.current;
    const THROTTLE_MS = 150; // max ~7 updates/sec

    const compute = () => {
      lastShadowTimeRef.current = Date.now();
      const [lng, lat] = selectedPoint;
      const sun = getSunPosition(currentTime, lat, lng);

      if (sun.altitude > 0.01) {
        const buildingInputs = analysisBuildings.map((b) => ({
          id: b.id, footprint: b.footprint, height: b.height,
        }));

        const shadows = calculateSimpleShadows(buildingInputs, sun.azimuth, sun.altitude, lat);
        setAnalysisShadows(shadows);

        // Tree shadows (convex hull approach — robust for small canopy polygons)
        if (analysisTrees.length > 0 && showTreeShadows) {
          const sinAngle = Math.sin(sun.azimuth);
          const cosAngle = Math.cos(sun.azimuth);
          const tShadows: ShadowPolygon[] = [];
          for (const tree of analysisTrees) {
            const radius = effectiveCanopyRadius(tree, currentTime);
            const canopy = buildCanopyPoly(tree.location, radius, lat);
            const coords = canopy.coordinates[0];
            const shadowLength = tree.height / Math.tan(sun.altitude);
            const dxDeg = shadowLength * sinAngle / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
            const dyDeg = shadowLength * cosAngle / METERS_PER_DEGREE_LAT;
            const shadowCoords = coords.map((c) => [c[0] + dxDeg, c[1] + dyDeg]);
            try {
              const allPoints = turf.featureCollection([
                ...coords.map((c) => turf.point(c)),
                ...shadowCoords.map((c) => turf.point(c)),
              ]);
              const hull = turf.convex(allPoints);
              if (hull) {
                tShadows.push({ buildingId: tree.id, geometry: hull.geometry as Polygon, sourceType: "tree" });
              }
            } catch { /* skip invalid */ }
          }
          setTreeShadowsStore(tShadows);
        } else {
          setTreeShadowsStore([]);
        }
      } else {
        setAnalysisShadows([]);
        setTreeShadowsStore([]);
      }
    };

    if (elapsed >= THROTTLE_MS) {
      compute();
    } else {
      if (shadowThrottleRef.current) clearTimeout(shadowThrottleRef.current);
      shadowThrottleRef.current = setTimeout(compute, THROTTLE_MS - elapsed);
    }

    return () => {
      if (shadowThrottleRef.current) clearTimeout(shadowThrottleRef.current);
    };
  }, [currentTime, selectedPoint, analysisBuildings, analysisTrees, showTreeShadows, setAnalysisShadows, setTreeShadowsStore]);

  // Sync satellite layer visibility with prop
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.setLayoutProperty(SATELLITE_LAYER, "visibility", satelliteOn ? "visible" : "none");
  }, [satelliteOn, mapLoaded]);

  // Update shadow layer on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource(SHADOW_SOURCE) as maplibregl.GeoJSONSource;
    if (!source) return;

    if (analysisShadows.length === 0) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const geojson: FeatureCollection<Polygon | MultiPolygon> = {
      type: "FeatureCollection",
      features: analysisShadows.map((s) => ({
        type: "Feature" as const,
        properties: { buildingId: s.buildingId },
        geometry: s.geometry,
      })),
    };

    source.setData(geojson);
  }, [analysisShadows, mapLoaded]);

  // Update tree shadow layer on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource(TREE_SHADOW_SOURCE) as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!showTreeShadows || treeShadows.length === 0) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const geojson: FeatureCollection<Polygon | MultiPolygon> = {
      type: "FeatureCollection",
      features: treeShadows.map((s) => ({
        type: "Feature" as const,
        properties: { buildingId: s.buildingId },
        geometry: s.geometry,
      })),
    };

    source.setData(geojson);
  }, [treeShadows, showTreeShadows, mapLoaded]);

  // Sync tree shadow layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.setLayoutProperty(TREE_SHADOW_LAYER, "visibility", showTreeShadows ? "visible" : "none");
  }, [showTreeShadows, mapLoaded]);

  // Show/hide marker + fly to point
  const prevPointRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (selectedPoint) {
      const prevPoint = prevPointRef.current;
      if (!prevPoint ||
          Math.abs(prevPoint[0] - selectedPoint[0]) > 0.001 ||
          Math.abs(prevPoint[1] - selectedPoint[1]) > 0.001) {
        const currentZoom = map.getZoom();
        map.flyTo({
          center: selectedPoint,
          zoom: Math.max(currentZoom, 16),
          duration: 1500,
        });
      }
      prevPointRef.current = selectedPoint;

      if (!markerRef.current) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:24px;height:24px;border-radius:50%;background:rgba(245,158,11,0.8);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);";
        markerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat(selectedPoint)
          .addTo(map);
      } else {
        markerRef.current.setLngLat(selectedPoint);
      }
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [selectedPoint, mapLoaded]);

  // POI markers
  const poiMarkersRef = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear old markers
    for (const m of poiMarkersRef.current) m.remove();
    poiMarkersRef.current = [];

    for (const poi of pois) {
      const el = document.createElement("div");
      el.style.cssText = `
        display:flex;align-items:center;justify-content:center;
        width:32px;height:32px;border-radius:50%;cursor:pointer;
        font-size:16px;background:rgba(255,255,255,0.92);
        border:2px solid #f59e0b;
        box-shadow:0 2px 6px rgba(0,0,0,0.25);
      `;
      el.textContent = CATEGORY_ICONS[poi.category];
      el.title = poi.name;

      el.addEventListener("mouseenter", () => {
        el.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.5), 0 2px 8px rgba(0,0,0,0.3)";
        el.style.borderColor = "#d97706";
      });
      el.addEventListener("mouseleave", () => {
        el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
        el.style.borderColor = "#f59e0b";
      });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (onPoiSelect) onPoiSelect(poi);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(poi.location)
        .addTo(map);
      poiMarkersRef.current.push(marker);
    }

    return () => {
      for (const m of poiMarkersRef.current) m.remove();
      poiMarkersRef.current = [];
    };
  }, [pois, mapLoaded, onPoiSelect]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Loading */}
      {isAnalyzing && (
        <div className="absolute top-14 right-16 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow text-sm text-gray-600 flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          Analysiere...
        </div>
      )}

      {/* Hint */}
      {!selectedPoint && !isAnalyzing && (
        <div className="absolute top-14 right-16 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow text-xs text-gray-500">
          Klicke auf die Karte für Sonnen-Analyse
        </div>
      )}
    </div>
  );
}
