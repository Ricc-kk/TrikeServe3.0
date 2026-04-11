// NEW APPROACH: Check database status directly instead of localStorage
// This replaces the checkForDriverStatusUpdate function in Home.tsx

const checkForDriverStatusUpdate = async () => {
  if (!currentRequestId) {
    console.log('❌ No currentRequestId, skipping driver status check');
    return;
  }

  try {
    // Query the database for the ride request status
    const { data: rideRequest, error } = await supabaseHelpers.getRideRequest(currentRequestId);

    console.log('🔍 Checking DATABASE for Ride Status:');
    console.log('   Ride ID:', currentRequestId);
    console.log('   DB Status:', rideRequest?.status);

    if (!error && rideRequest) {
      // Check what status we last showed to avoid duplicate popups
      const statusHistoryKey = `ride_status_shown_${currentRequestId}`;
      const lastShownStatus = localStorage.getItem(statusHistoryKey);

      // Determine if we need to show a popup
      if (rideRequest.status === 'in_progress' && lastShownStatus !== 'in_progress') {
        console.log('✅ Driver accepted! Showing popup...');
        setDriverStatusPopup({
          status: 'on-the-way',
          message: 'Your driver is on the way to pick you up!',
          timestamp: Date.now()
        });
        localStorage.setItem(statusHistoryKey, 'in_progress');

        setTimeout(() => setDriverStatusPopup(null), 4000);
      }
      else if (rideRequest.status === 'completed' && lastShownStatus !== 'completed') {
        console.log('✅ Ride completed! Showing popup...');
        setDriverStatusPopup({
          status: 'completed',
          message: 'Your ride has been completed!',
          timestamp: Date.now()
        });
        localStorage.setItem(statusHistoryKey, 'completed');

        setTimeout(() => {
          setRideStatus(null);
          setActiveRide(null);
          setCurrentRequestId(null);
          setPickup('');
          setDropoff('');
          setPickupAddress('');
          setDropoffAddress('');
          setSelectedVehicle(null);
          setDriverStatusPopup(null);
          localStorage.removeItem('trikeserve_active_ride');
          localStorage.removeItem(statusHistoryKey);
        }, 4000);
      }
    }
  } catch (error) {
    console.error('Error checking ride status:', error);
  }
};

