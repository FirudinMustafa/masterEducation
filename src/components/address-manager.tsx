"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LocationPicker } from "@/components/location-picker";

export interface AddressItem {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  postalCode: string | null;
  addressLine: string;
  isDefault: boolean;
}

interface AddressManagerProps {
  addresses: AddressItem[];
}

type FormState = {
  label: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  postalCode: string;
  addressLine: string;
  isDefault: boolean;
};

const EMPTY: FormState = {
  label: "",
  fullName: "",
  phone: "",
  city: "",
  district: "",
  postalCode: "",
  addressLine: "",
  isDefault: false,
};

export function AddressManager({ addresses }: AddressManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setForm({ ...EMPTY, isDefault: addresses.length === 0 });
    setEditingId(null);
    setShowForm(true);
    setError(null);
  }

  function startEdit(addr: AddressItem) {
    setForm({
      label: addr.label ?? "",
      fullName: addr.fullName,
      phone: addr.phone,
      city: addr.city,
      district: addr.district,
      postalCode: addr.postalCode ?? "",
      addressLine: addr.addressLine,
      isDefault: addr.isDefault,
    });
    setEditingId(addr.id);
    setShowForm(true);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      label: form.label || null,
      fullName: form.fullName,
      phone: form.phone,
      city: form.city,
      district: form.district,
      postalCode: form.postalCode || null,
      addressLine: form.addressLine,
      isDefault: form.isDefault,
    };
    const res = await fetch(
      editingId
        ? `/api/account/addresses/${editingId}`
        : "/api/account/addresses",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Kaydedilemedi.");
      return;
    }
    setShowForm(false);
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    if (!confirm("Adres silinsin mi?")) return;
    const res = await fetch(`/api/account/addresses/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Silinemedi.");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function setDefault(id: string) {
    const res = await fetch(`/api/account/addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Varsayilan yapilamadi.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        {!showForm && (
          <button
            onClick={startCreate}
            className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark cursor-pointer"
          >
            + Yeni Adres
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={save}
          className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
        >
          <h2 className="font-semibold text-brand-black">
            {editingId ? "Adresi Duzenle" : "Yeni Adres"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Etiket (Ev / Is)">
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </Field>
            <Field label="Ad Soyad *" required>
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </Field>
            <Field label="Telefon *" required>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </Field>
            <div className="md:col-span-2">
              <LocationPicker
                province={form.city}
                district={form.district}
                onProvinceChange={(city) => setForm({ ...form, city })}
                onDistrictChange={(district) => setForm({ ...form, district })}
                required
              />
            </div>
            <Field label="Posta Kodu">
              <input
                value={form.postalCode}
                onChange={(e) =>
                  setForm({ ...form, postalCode: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </Field>
          </div>
          <Field label="Adres *" required>
            <textarea
              value={form.addressLine}
              onChange={(e) =>
                setForm({ ...form, addressLine: e.target.value })
              }
              required
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) =>
                setForm({ ...form, isDefault: e.target.checked })
              }
            />
            Varsayilan adres yap
          </label>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-gray-500 hover:text-brand-black cursor-pointer"
            >
              Iptal
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-5 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
            >
              {editingId ? "Kaydet" : "Ekle"}
            </button>
          </div>
        </form>
      )}

      {addresses.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          Kayitli adresiniz yok.
        </div>
      ) : (
        <ul className="space-y-2">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-brand-black">
                    {a.label ?? "Adres"}
                  </span>
                  {a.isDefault && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-brand-gold-light text-brand-black">
                      Varsayilan
                    </span>
                  )}
                </div>
                <p className="text-sm text-brand-black">{a.fullName}</p>
                <p className="text-xs text-gray-500">{a.phone}</p>
                <p className="text-sm text-gray-700 mt-1">{a.addressLine}</p>
                <p className="text-xs text-gray-500">
                  {a.district}/{a.city}
                  {a.postalCode ? ` · ${a.postalCode}` : ""}
                </p>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                {!a.isDefault && (
                  <button
                    onClick={() => setDefault(a.id)}
                    className="text-brand-gold-dark hover:underline cursor-pointer"
                  >
                    Varsayilan yap
                  </button>
                )}
                <button
                  onClick={() => startEdit(a)}
                  className="text-blue-600 hover:underline cursor-pointer"
                >
                  Duzenle
                </button>
                <button
                  onClick={() => remove(a.id)}
                  className="text-red-600 hover:underline cursor-pointer"
                >
                  Sil
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </span>
      {children}
      {required ? null : null}
    </label>
  );
}
