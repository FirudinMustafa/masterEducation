"use client";

import { useMemo } from "react";
import { getProvinces, getDistricts } from "@/lib/turkey-locations";

interface LocationPickerProps {
  province: string;
  district: string;
  onProvinceChange: (province: string) => void;
  onDistrictChange: (district: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Field label override; defaults: "Il *" / "Ilce *" */
  provinceLabel?: string;
  districtLabel?: string;
  /** Form layout: side-by-side ("row") veya stacked ("col"). Default "row". */
  layout?: "row" | "col";
}

const SELECT_CLASSES =
  "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400";

/**
 * Türkiye il + ilçe seçici. İl seçilince ilçeler otomatik filtrelenir.
 * Bilinmeyen il girilirse (eski kayıtlar) o değer "(eski) X" diye seçili
 * tutulur ki form sıfırlanmasın.
 */
export function LocationPicker({
  province,
  district,
  onProvinceChange,
  onDistrictChange,
  required = false,
  disabled = false,
  provinceLabel = required ? "Il *" : "Il",
  districtLabel = required ? "Ilce *" : "Ilce",
  layout = "row",
}: LocationPickerProps) {
  const provinces = useMemo(() => getProvinces(), []);
  const districts = useMemo(() => getDistricts(province), [province]);

  // Eski (TR listesinde olmayan) değerleri kaybetme.
  const provinceUnknown = province && !provinces.includes(province);
  const districtUnknown =
    district && districts.length > 0 && !districts.includes(district);

  const containerClass =
    layout === "row"
      ? "grid grid-cols-1 md:grid-cols-2 gap-3"
      : "space-y-3";

  return (
    <div className={containerClass}>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">
          {provinceLabel}
        </span>
        <select
          value={province}
          onChange={(e) => {
            onProvinceChange(e.target.value);
            // İl değişince ilçeyi sıfırla — yanlış kombinasyon olmasın.
            onDistrictChange("");
          }}
          required={required}
          disabled={disabled}
          className={SELECT_CLASSES}
        >
          <option value="">Seciniz</option>
          {provinceUnknown && (
            <option value={province}>{`(eski) ${province}`}</option>
          )}
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">
          {districtLabel}
        </span>
        <select
          value={district}
          onChange={(e) => onDistrictChange(e.target.value)}
          required={required}
          disabled={disabled || !province}
          className={SELECT_CLASSES}
        >
          <option value="">
            {province ? "Seciniz" : "Once il seciniz"}
          </option>
          {districtUnknown && (
            <option value={district}>{`(eski) ${district}`}</option>
          )}
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
