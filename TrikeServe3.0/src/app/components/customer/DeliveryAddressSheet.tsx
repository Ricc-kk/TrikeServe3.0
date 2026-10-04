import { useState } from "react";
import { Clock, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";

import type { DeliveryAddressApi } from "../../contexts/useDeliveryAddress";
import AddPlaceSheet from "./AddPlaceSheet";

type DeliveryAddressSheetProps = {
  onClose: () => void;
  store: DeliveryAddressApi;
};

/**
 * Where the food is going.
 *
 * Three groups in priority order: what they used most recently, what they saved
 * with a name, and the address on their profile. Saving a place is the only way
 * to get something that shows up on another device, so the "Add new place"
 * action is present even when the saved list is empty.
 */
export default function DeliveryAddressSheet({
  onClose,
  store,
}: DeliveryAddressSheetProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const current = store.address;

  const pick = (address: Parameters<typeof store.selectAddress>[0]) => {
    store.selectAddress(address);
    onClose();
  };

  const saveEdit = async (id: string) => {
    if (!editLabel.trim()) return;
    setBusyId(id);
    await store.updateAddress(id, { label: editLabel.trim() });
    setBusyId(null);
    setEditingId(null);
  };

  const remove = async (id: string) => {
    setBusyId(id);
    await store.removeAddress(id);
    setBusyId(null);
    setEditingId(null);
  };

  if (adding) {
    return (
      <AddPlaceSheet
        onClose={() => setAdding(false)}
        onSave={async (input) => {
          // `saveAddress` reports failures in its return value rather than
          // throwing. Without re-throwing here the add-place sheet would close
          // on a failed write and the customer would believe the address was
          // saved when nothing was stored.
          const result = await store.saveAddress(input);
          if (result?.error) throw result.error;
        }}
        // Open the pin map on where they are already being delivered to.
        initialCenter={store.origin}
      />
    );
  }

  const noneYet = store.saved.length === 0 && store.recent.length === 0;

  return (
    <div
      className="fixed inset-0 z-[2100] flex flex-col bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Delivery address"
    >
      <div className="mt-auto flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl bg-[var(--surface)]">
        <div className="flex items-center gap-2 border-b border-line px-3 py-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-[var(--ink)]">
            Delivery address
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-11 flex-shrink-0 place-items-center rounded-xl hover:bg-[var(--muted)]"
          >
            <X className="size-5 text-[var(--muted-foreground)]" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {noneYet && (
            <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
              <MapPin
                className="mx-auto size-8 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
              <p className="mt-3 text-base font-bold text-[var(--ink)]">
                No address yet
              </p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Add a place so we know where to bring your order.
              </p>
            </div>
          )}

          {store.recent.length > 0 && (
            <section aria-label="Recent">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                <Clock className="size-3.5" aria-hidden="true" />
                Recent
              </h3>
              <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-line">
                {store.recent.map((item, i) => {
                  const selected = current?.address === item.address;
                  return (
                    <li key={`${item.address}-${i}`}>
                      <button
                        type="button"
                        onClick={() => pick(item)}
                        aria-pressed={selected}
                        className={`flex min-h-14 w-full items-start gap-2 px-4 py-3 text-left ${
                          selected ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--muted)]"
                        }`}
                      >
                        <MapPin
                          className="mt-0.5 size-4 flex-shrink-0 text-[var(--muted-foreground)]"
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                            {item.label}
                          </span>
                          <span className="block truncate text-xs text-[var(--muted-foreground)]">
                            {item.address}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {store.saved.length > 0 && (
            <section aria-label="Saved places">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                Saved
              </h3>
              <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-line">
                {store.saved.map((item) => {
                  const selected = current?.id === item.id;
                  const editing = editingId === item.id;
                  return (
                    <li key={item.id} className="p-3">
                      {editing ? (
                        <div className="space-y-2">
                          <label
                            htmlFor={`edit-${item.id}`}
                            className="sr-only"
                          >
                            Name for {item.address}
                          </label>
                          <input
                            id={`edit-${item.id}`}
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="min-h-11 w-full rounded-xl border border-line px-3 outline-none focus:border-[var(--primary)]"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(item.id)}
                              disabled={busyId === item.id}
                              className="min-h-11 flex-1 rounded-xl bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] disabled:opacity-50"
                            >
                              Save name
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="min-h-11 flex-1 rounded-xl bg-[var(--muted)] text-sm font-bold text-[var(--muted-foreground)]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              pick({
                                id: item.id,
                                label: item.label,
                                address: item.address,
                                latitude: item.latitude,
                                longitude: item.longitude,
                                source: "saved",
                              })
                            }
                            aria-pressed={selected}
                            className={`flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-xl px-2 py-2 text-left ${
                              selected ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--muted)]"
                            }`}
                          >
                            <MapPin
                              className="mt-0.5 size-4 flex-shrink-0 text-[var(--muted-foreground)]"
                              aria-hidden="true"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                                {item.label}
                              </span>
                              <span className="block truncate text-xs text-[var(--muted-foreground)]">
                                {item.address}
                              </span>
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(item.id);
                              setEditLabel(item.label);
                            }}
                            aria-label={`Rename ${item.label}`}
                            className="grid size-11 flex-shrink-0 place-items-center rounded-xl hover:bg-[var(--muted)]"
                          >
                            <Pencil className="size-4 text-[var(--muted-foreground)]" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(item.id)}
                            disabled={busyId === item.id}
                            aria-label={`Remove ${item.label}`}
                            className="grid size-11 flex-shrink-0 place-items-center rounded-xl hover:bg-[var(--error-soft)] disabled:opacity-50"
                          >
                            <Trash2 className="size-4 text-[var(--error)]" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line px-5 font-bold text-[var(--ink)] hover:bg-[var(--muted)]"
          >
            <Plus className="size-5 text-[var(--primary)]" aria-hidden="true" />
            Add new place
          </button>
        </div>
      </div>
    </div>
  );
}