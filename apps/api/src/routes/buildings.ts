import type { FastifyInstance } from "fastify";
import { query } from "../config/database.js";

interface BuildingsQuery {
  bbox: string;
  zoom?: string;
}

export async function buildingsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: BuildingsQuery }>(
    "/buildings",
    async (request, reply) => {
      const { bbox, zoom } = request.query;

      if (!bbox) {
        return reply.code(400).send({ error: "bbox parameter is required" });
      }

      const parts = bbox.split(",").map(Number);
      if (parts.length !== 4 || parts.some(isNaN)) {
        return reply.code(400).send({
          error: "bbox must be minLng,minLat,maxLng,maxLat",
        });
      }

      const [minLng, minLat, maxLng, maxLat] = parts;
      const zoomLevel = parseInt(zoom || "15", 10);

      try {
        const result = await query(
          `SELECT
            id,
            osm_id,
            ST_AsGeoJSON(footprint)::json as geometry,
            height,
            levels,
            height_source
          FROM buildings
          WHERE footprint && ST_MakeEnvelope($1, $2, $3, $4, 4326)
          LIMIT $5`,
          [minLng, minLat, maxLng, maxLat, zoomLevel >= 15 ? 5000 : 1000],
        );

        const geojson = {
          type: "FeatureCollection",
          features: result.rows.map((row: Record<string, unknown>) => ({
            type: "Feature",
            properties: {
              id: row.id,
              height: row.height,
              levels: row.levels,
              heightSource: row.height_source,
            },
            geometry: row.geometry,
          })),
        };

        return reply.send(geojson);
      } catch (err) {
        app.log.error(err);
        return reply.code(500).send({ error: "Database query failed" });
      }
    },
  );
}
