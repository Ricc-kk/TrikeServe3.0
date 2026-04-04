import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export default function MyDestination() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState('');

  const handleSetDestination = () => {
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
          My Destination
        </h1>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-sm text-[#64748B] mb-3">
          Set your preferred destination to receive relevant trip requests
        </p>

        <Input
          placeholder="Enter destination address"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="w-full"
        />

        <div className="space-y-2 mt-4">
          <button 
            onClick={() => {
              setDestination('Tagalag Terminal');
            }}
            className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-[#E11D48] transition-colors bg-white"
          >
            <p className="font-semibold text-[#121212]">Tagalag Terminal</p>
            <p className="text-xs text-[#64748B]">Main Road, Tagalag</p>
          </button>
          <button 
            onClick={() => {
              setDestination('Barangay Hall');
            }}
            className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-[#E11D48] transition-colors bg-white"
          >
            <p className="font-semibold text-[#121212]">Barangay Hall</p>
            <p className="text-xs text-[#64748B]">Tagalag Center</p>
          </button>
          <button 
            onClick={() => {
              setDestination('Tagalag Market');
            }}
            className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-[#E11D48] transition-colors bg-white"
          >
            <p className="font-semibold text-[#121212]">Tagalag Market</p>
            <p className="text-xs text-[#64748B]">Market District</p>
          </button>
        </div>

        <Button 
          onClick={handleSetDestination}
          className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase mt-4"
        >
          Set Destination
        </Button>
      </div>
    </div>
  );
}
