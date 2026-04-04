import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Package, Users, Car } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

export default function ServiceTypes() {
  const navigate = useNavigate();
  const [selectedServices, setSelectedServices] = useState<string[]>(['shared', 'delivery']);
  const [currentSeats, setCurrentSeats] = useState(0);

  const handleSave = () => {
    navigate('/rider');
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
              if (selectedServices.includes('private')) {
                setSelectedServices(selectedServices.filter(s => s !== 'private'));
              } else {
                setSelectedServices([...selectedServices, 'private']);
              }
            }}
            className={`flex items-center justify-between p-4 border-2 cursor-pointer transition-all ${
              selectedServices.includes('private') 
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
              selectedServices.includes('private') 
                ? 'bg-[#E11D48] border-[#E11D48]' 
                : 'border-gray-300'
            }`}>
              {selectedServices.includes('private') && (
                <div className="w-2 h-2 bg-white rounded-sm" />
              )}
            </div>
          </Card>
        </div>

        {/* Seat Management for Shared Mode */}
        {selectedServices.includes('shared') && (
          <Card className="p-4 mt-4">
            <p className="text-sm font-semibold text-[#121212] mb-3">Current Seats Taken</p>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((num) => (
                <Button
                  key={num}
                  onClick={() => setCurrentSeats(num)}
                  variant={currentSeats === num ? 'default' : 'outline'}
                  size="sm"
                  className={`flex-1 ${currentSeats === num ? 'bg-[#E11D48] hover:bg-[#BE123C]' : ''}`}
                >
                  {num}
                </Button>
              ))}
            </div>
            <p className="text-xs text-[#64748B] mt-2">
              {currentSeats === 4 ? 'Trike is full' : `${4 - currentSeats} seat(s) available`}
            </p>
          </Card>
        )}

        <Button 
          onClick={handleSave}
          className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase mt-4"
        >
          Save Service Types
        </Button>
      </div>
    </div>
  );
}