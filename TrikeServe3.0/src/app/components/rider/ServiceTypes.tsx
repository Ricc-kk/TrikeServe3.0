import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Package, Users, Car } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { useAuth } from "../../contexts/AuthContext";

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
  const { user, updateProfile } = useAuth();

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
    const result = await updateProfile({
      serviceTypes: selectedServices,
    });
    setIsSaving(false);

    if (result.success) {
      navigate('/rider');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <div className="bg-white border-b-2 border-[#CBD5E1] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-extrabold text-[#E11D48]" style={{ letterSpacing: '-0.02em' }}>
          Service Types
        </h1>
      </div>

      <div className="p-4 space-y-5">
        <p className="text-sm text-[#64748B]">
          Choose a category, then select the service types you want to accept.
          {category === 'rides' && ' You can select both Ride Share and Private Ride.'}
        </p>

        {/* Step 1: Category */}
        <div>
          <h2 className="text-sm font-bold text-[#121212] mb-2 uppercase tracking-wide">1. Choose a category</h2>
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => {
              const active = category === cat.key;
              return (
                <Card
                  key={cat.key}
                  onClick={() => selectCategory(cat.key)}
                  className={`p-4 border-2 cursor-pointer transition-all ${
                    active
                      ? 'border-[#E11D48] bg-red-50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      active ? 'bg-[#E11D48] text-white' : 'bg-gray-100 text-[#64748B]'
                    }`}>
                      <cat.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#121212]">{cat.name}</p>
                      <p className="text-xs text-[#64748B]">{cat.description}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      active ? 'border-[#E11D48]' : 'border-gray-300'
                    }`}>
                      {active && <div className="w-2.5 h-2.5 bg-[#E11D48] rounded-full" />}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Step 2: Service type within category */}
        <div>
          <h2 className="text-sm font-bold text-[#121212] mb-2 uppercase tracking-wide">
            2. Select service types
          </h2>
          <div className="space-y-2">
            {SERVICE_OPTIONS[category].map((option) => {
              const active = selectedServices.includes(option.key);
              const isMulti = category === 'rides';
              return (
                <Card
                  key={option.key}
                  onClick={() => (isMulti ? toggleRideType(option.key) : undefined)}
                  className={`flex items-center justify-between p-4 border-2 cursor-pointer transition-all ${
                    active
                      ? 'border-[#E11D48] bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      active ? 'bg-[#E11D48] text-white' : 'bg-gray-100 text-[#64748B]'
                    }`}>
                      <option.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#121212]">{option.name}</p>
                      <p className="text-xs text-[#64748B]">{option.description}</p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    active ? 'bg-[#E11D48] border-[#E11D48]' : 'border-gray-300'
                  }`}>
                    {active && <div className="w-2 h-2 bg-white rounded-sm" />}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase"
        >
          {isSaving ? 'Saving...' : 'Save Service Types'}
        </Button>
      </div>
    </div>
  );
}