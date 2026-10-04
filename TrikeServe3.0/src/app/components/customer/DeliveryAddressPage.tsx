import { useState } from "react";
import {
  Check,
  ChevronLeft,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router";

import { useDeliveryAddress } from "../../contexts/useDeliveryAddress";
import { usePreviousPage } from "../../hooks/usePreviousPage";

/**
 * Where the food is going.
 *
 * This was a modal inside the food screen with a third "Save a new place"
 * block at the bottom. It is now a page, because choosing a delivery address
 * involves four screens and a modal that deep is a trapdoor: the Android back
 * button closed the whole picker halfway through saving one.
 *
 * Two groups in priority order — what they used most recently, and what they
 * saved with a name. Adding an address lives inside Saved as a "+" row rather
 * than as a separate block at the end, because it is an action on that list,
 * not a fourth thing competing with it.
 *
 * Tapping a row here is what sets where the order is delivered. The screens
 * behind "add new address" only add a place to the list.
 */
export default function DeliveryAddressPage() {
  const navigate = useNavigate();
  // Normally the food screen, but this list is also linked from the home
  // header's "Your location" line, so back follows the actual way in.
  const goBack = usePreviousPage("/customer/food");
  const delivery = useDeliveryAddress();

  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const current = delivery.address;
  const term = query.trim().toLowerCase();

  const matches = (label: string, address: string) =>
    !term ||
    label.toLowerCase().includes(term) ||
    address.toLowerCase().includes(term);

  // Hiding non-matching rows rather than showing "no results" keeps the two
  // sections recognisable while typing.
  const recent = delivery.recent.filter((r) => matches(r.label, r.address));
  const saved = delivery.saved.filter((s) => matches(s.label, s.address));

  const pick = (address: Parameters<typeof delivery.selectAddress>[0]) => {
    delivery.selectAddress(address);
    navigate("/customer/food");
  };

  const saveEdit = async (id: string) => {
    if (!editLabel.trim()) return;
    setBusyId(id);
    await delivery.updateAddress(id, { label: editLabel.trim() });
    setBusyId(null);
    setEditingId(null);
  };

  const remove = async (id: string) => {
    setBusyId(id);
    await delivery.removeAddress(id);
    setBusyId(null);
    setEditingId(null);
  };

  const noneYet = delivery.saved.length === 0 && delivery.recent.length === 0;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-line bg-[var(--surface)] px-3 py-3 sm:px-5">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="grid size-11 flex-shrink-0 place-items-center rounded-xl hover:bg-[var(--muted)]"
          >
            <ChevronLeft className="size-5 text-[var(--ink)]" aria-hidden="true" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-[var(--ink)]">
            Delivery address
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 pb-12">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--muted-foreground)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved addresses"
            aria-label="Search saved addresses"
            className="min-h-13 w-full rounded-2xl border border-line bg-[var(--surface)] pl-11 pr-4 text-base text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>

        {noneYet && (
          <div className="mt-4 rounded-2xl border border-dashed border-line px-5 py-8 text-center">
            <MapPin
              className="mx-auto size-8 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <p className="mt-3 text-base font-bold text-[var(--ink)]">No address yet</p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Add a place so we know where to bring your order.
            </p>
          </div>
        )}

        {recent.length > 0 && (
          <section className="mt-5" aria-label="Recent">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              <Clock className="size-3.5" aria-hidden="true" />
              Recent
            </h2>
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-line bg-[var(--surface)]">
              {recent.map((item, i) => {
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
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                          {item.label}
                        </span>
                        <span className="block truncate text-xs text-[var(--muted-foreground)]">
                          {item.address}
                        </span>
                      </span>
                      {selected && (
                        <Check
                          className="mt-0.5 size-4 flex-shrink-0 text-[var(--primary)]"
                          aria-label="Current delivery address"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-5" aria-label="Saved">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            Saved
          </h2>

          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-line bg-[var(--surface)]">
            {saved.map((item) => {
              const selected = current?.id === item.id;
              const editing = editingId === item.id;
              return (
                <li key={item.id} className="p-2">
                  {editing ? (
                    <div className="space-y-2">
                      <label htmlFor={`edit-${item.id}`} className="sr-only">
                        Name for {item.address}
                      </label>
                      <input
                        id={`edit-${item.id}`}
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        autoFocus
                        className="min-h-11 w-full rounded-xl border border-line px-3 text-base text-[var(--ink)] outline-none focus:border-[var(--primary)]"
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
                    <div className="flex items-start gap-1">
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
                        <Pencil
                          className="size-4 text-[var(--muted-foreground)]"
                          aria-hidden="true"
                        />
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

            {/* Inside the list, not below it: adding a place is an action on
                this list, and when the list is empty this row is the only thing
                on screen saying what to do next. */}
            <li className="border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => navigate("/customer/delivery-address/new")}
                className="flex min-h-14 w-full items-center gap-2 px-4 py-3 text-left hover:bg-[var(--muted)]"
              >
                <span className="grid size-8 flex-shrink-0 place-items-center rounded-full bg-[var(--primary-soft)]">
                  <Plus className="size-4 text-[var(--primary)]" aria-hidden="true" />
                </span>
                <span className="text-sm font-bold text-[var(--primary)]">
                  add new address
                </span>
              </button>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}