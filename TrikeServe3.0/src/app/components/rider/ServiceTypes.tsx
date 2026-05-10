import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Package, Users, Car } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { useAuth } from "../../contexts/AuthContext";

export default function ServiceTypes() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const [selectedServices, setSelectedServices] = useState<string[]>(user?.serviceTypes || ['shared', 'delivery']);
  const [isSaving, setIsSaving] = useState(false);

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

      <div className="p-4 space-y-3">
        <p className="text-sm text-[#64748B] mb-3">
          Select which service types you want to accept
        </p>

        <div className="space-y-2">
          {/* Delivery */}
          <Card
            onClick={() => {
              if (selectedServices.includes('delivery')) {
                setSelectedServices(selectedServices.filter(s => s !== 'delivery'));
              } else {
                setSelectedServices([...selectedServices, 'delivery']);
              }
            }}
            className={`flex items-center justify-between p-4 border-2 cursor-pointer transition-all ${
              selectedServices.includes('delivery') 
                ? 'border-[#E11D48] bg-red-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-[#E11D48]" />
              <div>
                <p className="font-semibold text-[#121212]">Delivery</p>
                <p className="text-xs text-[#64748B]">Food & package delivery</p>
              </div>
            </div>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
              selectedServices.includes('delivery') 
                ? 'bg-[#E11D48] border-[#E11D48]' 
                : 'border-gray-300'
            }`}>
              {selectedServices.includes('delivery') && (
                <div className="w-2 h-2 bg-white rounded-sm" />
              )}
            </div>
          </Card>

          {/* Ride Share (Sasabay) */}
          <Card
            onClick={() => {
              if (selectedServices.includes('shared')) {
                setSelectedServices(selectedServices.filter(s => s !== 'shared'));
              } else {
                setSelectedServices([...selectedServices, 'shared']);
              }
            }}
            className={`flex items-center justify-between p-4 border-2 cursor-pointer transition-all ${
              selectedServices.includes('shared') 
                ? 'border-[#E11D48] bg-red-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-[#E11D48]" />
              <div>
                <p className="font-semibold text-[#121212]">Ride Share</p>
                <p className="text-xs text-[#64748B]">Shared rides with other passengers</p>
              </div>
            </div>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
              selectedServices.includes('shared') 
                ? 'bg-[#E11D48] border-[#E11D48]' 
                : 'border-gray-300'
            }`}>
              {selectedServices.includes('shared') && (
                <div className="w-2 h-2 bg-white rounded-sm" />
              )}
            </div>
          </Card>

          {/* Private Ride (Pakyaw) */}
          <Card
            onClick={() => {
              if (selectedServices.includes('special')) {
                setSelectedServices(selectedServices.filter(s => s !== 'special'));
              } else {
                setSelectedServices([...selectedServices, 'special']);
              }
            }}
            className={`flex items-center justify-between p-4 border-2 cursor-pointer transition-all ${
              selectedServices.includes('special')
                ? 'border-[#E11D48] bg-red-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <Car className="w-5 h-5 text-[#E11D48]" />
              <div>
                <p className="font-semibold text-[#121212]">Private Ride</p>
                <p className="text-xs text-[#64748B]">Exclusive rides, no sharing</p>
              </div>
            </div>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
              selectedServices.includes('special')
                ? 'bg-[#E11D48] border-[#E11D48]' 
                : 'border-gray-300'
            }`}>
              {selectedServices.includes('special') && (
                <div className="w-2 h-2 bg-white rounded-sm" />
              )}
            </div>
          </Card>
        </div>

        {/* Seat management removed */}

        <Button 
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase mt-4"
        >
          {isSaving ? 'Saving...' : 'Save Service Types'}
        </Button>
      </div>
    </div>
  );
}