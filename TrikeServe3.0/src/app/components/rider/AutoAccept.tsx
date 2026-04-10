import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Volume2 } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

export default function AutoAccept() {
  const navigate = useNavigate();
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState(false);
  const [soundNotificationEnabled, setSoundNotificationEnabled] = useState(true);

  const playNotificationSound = () => {
    // Create audio context for notification sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set notification sound parameters
    oscillator.frequency.value = 800; // Hz
    oscillator.type = 'sine';

    // Create a notification sound pattern (beep-beep-beep)
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);

    // Second beep
    const oscillator2 = audioContext.createOscillator();
    oscillator2.connect(gainNode);
    oscillator2.frequency.value = 900;
    oscillator2.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + 0.15);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);

    oscillator2.start(audioContext.currentTime + 0.15);
    oscillator2.stop(audioContext.currentTime + 0.25);

    // Third beep
    const oscillator3 = audioContext.createOscillator();
    oscillator3.connect(gainNode);
    oscillator3.frequency.value = 1000;
    oscillator3.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

    oscillator3.start(audioContext.currentTime + 0.3);
    oscillator3.stop(audioContext.currentTime + 0.4);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <div className="bg-white border-b-2 border-[#CBD5E1] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold text-[#E11D48]">Auto Accept</h1>
          <p className="text-xs text-[#64748B]">Automatically accept incoming requests</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Enable/Disable Toggle */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#121212]">Enable Auto Accept</h2>
              <p className="text-sm text-[#64748B]">Automatically accept matching requests</p>
            </div>
            <button
              onClick={() => setAutoAcceptEnabled(!autoAcceptEnabled)}
              className={`w-12 h-6 rounded-full transition-colors ${
                autoAcceptEnabled ? 'bg-[#E11D48]' : 'bg-gray-300'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  autoAcceptEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </Card>

        {/* Sound Notification Settings */}
        <Card className="p-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <Volume2 className="w-5 h-5 text-[#E11D48] mt-1" />
                <div>
                  <h3 className="text-lg font-bold text-[#121212]">Sound Notification</h3>
                  <p className="text-sm text-[#64748B]">Get notified with sound when requests come in</p>
                </div>
              </div>
              <button
                onClick={() => setSoundNotificationEnabled(!soundNotificationEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  soundNotificationEnabled ? 'bg-[#E11D48]' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    soundNotificationEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {soundNotificationEnabled && (
              <Button
                onClick={playNotificationSound}
                className="w-full bg-[#10B981] hover:bg-[#059669] text-white font-bold"
              >
                <Volume2 className="w-4 h-4 mr-2" />
                Test Notification Sound
              </Button>
            )}
          </div>
        </Card>

        {/* Service Types */}
        {autoAcceptEnabled && (
          <Card className="p-5">
            <h3 className="text-lg font-bold text-[#121212] mb-4">Service Types</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" className="w-5 h-5" />
                <span>📦 Delivery</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="w-5 h-5" />
                <span>👥 Ride Share</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="w-5 h-5" />
                <span>🚗 Private Ride</span>
              </label>
            </div>
          </Card>
        )}
      </div>

      {/* Footer Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#CBD5E1] p-4">
        <Button
          onClick={() => navigate('/rider')}
          className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold uppercase"
        >
          Done
        </Button>
      </div>

      <div className="h-20" />
    </div>
  );
}

