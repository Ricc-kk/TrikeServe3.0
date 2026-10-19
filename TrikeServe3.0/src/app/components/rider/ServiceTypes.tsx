import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, Check, Package, Users, Car } from "lucide-react";
import { Button } from "../ui/button";
import { useAuth } from "../../contexts/AuthContext";
import ActiveRideButton from "./ActiveRideButton";

type ServiceCategory = 'rides' | 'delivery';
type ServiceType = 'private' | 'shared' | 'delivery';

interface ServiceOption {
  key: ServiceType;
  name: string;
  description: string;
  icon: typeof Users;
}

const CATEGORIES: { key: ServiceCategory; name: string; description: string; icon: typeof Users }[] = [
  { key: 'rides', name: 'Rides', description: 'Transport passengers', icon: Users },
  { key: 'delivery', name: 'Delivery', description: 'Food & package delivery', icon: Package },
];

const SERVICE_OPTIONS: Record<ServiceCategory, ServiceOption[]> = {
  rides: [
    { key: 'shared', name: 'Ride Share', description: 'Shared rides with other passengers', icon: Users },
    { key: 'private', name: 'Private Ride', description: 'Exclusive rides, no sharing', icon: Car },
  ],
  delivery: [
    { key: 'delivery', name: 'Delivery', description: 'Food & package delivery', icon: Package },
  ],
};

export default function ServiceTypes() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, updateProfile } = useAuth();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo || '/rider';

  // Rides can include Ride Share and/or Private Ride; Delivery is exclusive with a single option
  const normalizeSelection = (existing: string[] = []): { category: ServiceCategory; rides: ServiceType[] } => {
    const valid = existing.filter((s) => ['private', 'shared', 'delivery'].includes(s));
    const rides = valid.filter((s) => s === 'shared' || s === 'private');
    return {
      category: valid.includes('delivery') ? 'delivery' : 'rides',
      rides: rides.length > 0 ? rides : ['shared'],
    };
  };

  const initial = normalizeSelection(user?.serviceTypes);
  const [category, setCategory] = useState<ServiceCategory>(initial.category);
  const [ridesSelection, setRidesSelection] = useState<ServiceType[]>(initial.rides);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delivery is the only option in its category; Rides selection is preserved across category switches
  const selectedServices = category === 'delivery' ? ['delivery'] : ridesSelection;

  const selectCategory = (next: ServiceCategory) => {
    setCategory(next);
  };

  const toggleRideType = (key: ServiceType) => {
    setRidesSelection((prev) => {
      if (prev.includes(key)) {
        // Keep at least one ride type selected
        return prev.length > 1 ? prev.filter((s) => s !== key) : prev;
      }
      return [...prev, key];
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await updateProfile({ serviceTypes: selectedServices });
      if (result.success) {
        navigate(returnTo, { replace: true });
      } else {
        setSaveError(result.error || 'Could not save your service types. Please try again.');
      }
    } catch {
      setSaveError('Could not save your service types. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[var(--muted)] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[var(--ink)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" aria-label="Back" onClick={() => navigate(returnTo, { replace: true })}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Rider settings</p>
            <h1 className="text-lg font-extrabold leading-tight text-[var(--ink)]">Service Types</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full gap-5 px-4 py-5">
        <section className="rounded-2xl border border-[var(--border)] bg-surface p-4 shadow-sm">
          <p className="text-sm text-[var(--muted-foreground)]">
            Choose the kind of work you want to receive. You can offer both ride services, or switch to delivery.
          </p>
          <h2 className="mb-3 mt-5 text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Choose a category</h2>
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => {
              const active = category === cat.key;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectCategory(cat.key)}
                  className={`flex min-h-28 flex-col items-start justify-between rounded-2xl border-2 p-3 text-left transition-colors ${active ? 'border-[var(--primary)] bg-[var(--error-soft)]' : 'border-[var(--border)] bg-surface hover:border-[var(--primary)]/50'}`}
                >
                  <span className={`grid size-10 place-items-center rounded-xl ${active ? 'bg-[var(--primary)] text-white' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-[var(--ink)]">{cat.name}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-[var(--muted-foreground)]">{cat.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-surface p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-bold text-[var(--ink)]">Select your services</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {category === 'rides' ? 'Choose one or both. At least one ride service must stay selected.' : 'Delivery requests will be available while you are online.'}
            </p>
          </div>
          <div className="grid gap-3">
            {SERVICE_OPTIONS[category].map((option) => {
              const active = selectedServices.includes(option.key);
              const Icon = option.icon;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { if (category === 'rides') toggleRideType(option.key); }}
                  className={`flex min-h-24 w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${active ? 'border-[var(--primary)] bg-[var(--error-soft)]' : 'border-[var(--border)] bg-surface hover:border-[var(--primary)]/50'}`}
                >
                  <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${active ? 'bg-[var(--primary)] text-white' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[var(--ink)]">{option.name}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-[var(--muted-foreground)]">{option.description}</span>
                  </span>
                  <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${active ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--border)] text-transparent'}`}>
                    <Check className="size-4" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        {saveError && (
          <p role="alert" className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-soft)] px-4 py-3 text-sm font-medium text-[var(--error)]">
            {saveError}
          </p>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-[1050] border-t border-[var(--border)] bg-surface/95 px-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full items-center gap-3">
          <Button onClick={handleSave} disabled={isSaving} className="min-h-12 w-full bg-[var(--primary)] font-bold text-white hover:bg-[var(--primary)]">
            {isSaving ? 'Saving…' : 'Save Service Types'}
          </Button>
        </div>
      </div>
      <ActiveRideButton />
    </div>
  );
}
