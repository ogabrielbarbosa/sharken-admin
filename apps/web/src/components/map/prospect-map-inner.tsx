'use client';

import type { ProspectedCity } from '@lps/domain';
import 'leaflet/dist/leaflet.css';
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { useEffect } from 'react';

export type MapSelection = { center: { lat: number; lng: number }; radiusKm: number; cities: { location: string; lat: number; lng: number }[] };

const BRASIL = { lat: -15.8, lng: -47.9 };

/** Enquadra o que importa: a seleção do batch novo, ou as cidades já prospectadas. */
function Fit({ points, radiusKm }: { points: { lat: number; lng: number }[]; radiusKm?: number }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat},${p.lng}`).join(';') + `:${radiusKm ?? ''}`;
  useEffect(() => {
    if (!points.length) return;
    // Com raio, enquadra o círculo (um grau de latitude tem uns 111 km); sem raio, as cidades com uma margem.
    const deg = (radiusKm ?? 0) / 111;
    const lats = points.flatMap((p) => [p.lat - deg, p.lat + deg]);
    const lngs = points.flatMap((p) => [p.lng - deg, p.lng + deg]);
    const pad = deg ? 0.02 : 0.4;
    map.fitBounds([[Math.min(...lats) - pad, Math.min(...lngs) - pad], [Math.max(...lats) + pad, Math.max(...lngs) + pad]], { animate: false });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const radiusOf = (leads: number) => Math.min(6 + Math.sqrt(leads) * 2, 26);

/**
 * Mapa de onde já houve batch (círculo cinza-azulado, maior com mais leads) e, no batch novo, o centro,
 * o raio e as cidades escolhidas (azul forte).
 */
export default function ProspectMapInner({ cities, selection, height = 360, onPick }: {
  cities: ProspectedCity[];
  selection?: MapSelection;
  height?: number;
  onPick?: (location: string) => void;
}) {
  const focus = selection ? (selection.radiusKm ? [selection.center] : [selection.center, ...selection.cities]) : cities;
  return (
    <div style={{ height }} className="overflow-hidden rounded-lg border border-border">
      <MapContainer center={BRASIL} zoom={4} scrollWheelZoom className="size-full bg-[#0b0f14]" attributionControl>
        {/* Mapa do OpenStreetMap, invertido por CSS para combinar com o painel escuro (.map-dark no globals.css). */}
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          className="map-dark"
        />
        <Fit points={focus} radiusKm={selection?.radiusKm} />
        {cities.map((c) => (
          <CircleMarker
            key={c.location}
            center={c}
            radius={radiusOf(c.leads)}
            pathOptions={{ color: '#7fb3d5', weight: 1, fillColor: '#7fb3d5', fillOpacity: 0.25 }}
            eventHandlers={onPick ? { click: () => onPick(c.location) } : undefined}
          >
            <Tooltip>
              <strong>{c.location}</strong>
              <br />
              {c.leads} leads em {c.batches.length} {c.batches.length === 1 ? 'batch' : 'batches'}
              {[...new Set(c.batches.map((b) => b.business_type))].slice(0, 6).map((n) => <span key={n}><br />· {n}</span>)}
            </Tooltip>
          </CircleMarker>
        ))}
        {selection && (
          <>
            {selection.radiusKm > 0 && <Circle center={selection.center} radius={selection.radiusKm * 1000} pathOptions={{ color: '#1f88c0', weight: 1, dashArray: '4 4', fillOpacity: 0.06 }} />}
            {selection.cities.map((c) => (
              <CircleMarker key={`sel-${c.location}`} center={c} radius={5} pathOptions={{ color: '#ffffff', weight: 1, fillColor: '#1f88c0', fillOpacity: 1 }}>
                <Tooltip>{c.location}</Tooltip>
              </CircleMarker>
            ))}
          </>
        )}
      </MapContainer>
    </div>
  );
}
