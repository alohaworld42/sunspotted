import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { useMapStore } from "../../store/mapStore";
import { useAnalysisStore } from "../../store/analysisStore";
import { useTimeStore } from "../../store/timeStore";
import { usePointAnalysis } from "../../hooks/usePointAnalysis";
import { getSunPosition } from "../../lib/sun/position";
import { calculateSimpleShadows } from "../../lib/shadow/projection";

// OpenFreeMap: free, no API key, includes OpenMapTiles vector data with buildings
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

// Esri World Imagery: free satellite tiles, no API key
const SATELLITE_TILES = "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const SHADOW_SOURCE = "analysis-shadows";
const SHADOW_LAYER = "analysis-shadow-layer";
const SATELLITE_SOURCE = "satellite-imagery";
const SATELLITE_LAYER = "satellite-layer";
const BUILDINGS_3D_LAYER = "3d-buildings";

export function MapContainer() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [satelliteOn, setSatelliteOn] = useState(false);

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
  const analysisBuildings = useAnalysisStore((s) => s.analysisBuildings);
  const setAnalysisShadows = useAnalysisStore((s) => s.setAnalysisShadows);
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
    });

    map.on("moveend", () => updateMapState(map));

    // Click = analyze that point
    map.on("click", (e) => {
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
        satelliteOn ? "#b0b0b8" : "#e0e0e4");
    } else {
      // Night: dim flat lighting
      map.setLight({
        anchor: "viewport",
        position: [1.5, 0, 80],
        intensity: 0.3,
        color: "#c0c8d8",
      });
      map.setPaintProperty(BUILDINGS_3D_LAYER, "fill-extrusion-color",
        satelliteOn ? "#808088" : "#b0b0b8");
    }
  }, [currentTime, center, mapLoaded, satelliteOn]);

  // Re-compute shadows when time changes (if we have buildings from a previous analysis)
  useEffect(() => {
    if (!selectedPoint || analysisBuildings.length === 0) return;

    const [lng, lat] = selectedPoint;
    const sun = getSunPosition(currentTime, lat, lng);

    if (sun.altitude > 0.01) {
      const buildingInputs = analysisBuildings.map((b) => ({
        id: b.id, footprint: b.footprint, height: b.height,
      }));
      const shadows = calculateSimpleShadows(buildingInputs, sun.azimuth, sun.altitude, lat);
      setAnalysisShadows(shadows);
    } else {
      setAnalysisShadows([]);
    }
  }, [currentTime, selectedPoint, analysisBuildings, setAnalysisShadows]);

  // Toggle satellite layer
  const toggleSatellite = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const newState = !satelliteOn;
    setSatelliteOn(newState);
    map.setLayoutProperty(SATELLITE_LAYER, "visibility", newState ? "visible" : "none");
    map.setPaintProperty(BUILDINGS_3D_LAYER, "fill-extrusion-opacity", newState ? 0.85 : 0.75);
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

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Satellite toggle */}
      <button
        type="button"
        onClick={toggleSatellite}
        className="absolute bottom-16 left-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2 cursor-pointer"
        title={satelliteOn ? "Karte anzeigen" : "Satellit anzeigen"}
      >
        {satelliteOn ? (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Karte
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Satellit
          </>
        )}
      </button>

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
