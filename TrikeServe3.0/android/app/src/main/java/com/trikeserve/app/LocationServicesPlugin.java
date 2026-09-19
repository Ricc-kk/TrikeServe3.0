package com.trikeserve.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Small app-local Capacitor plugin used to drive the location permission /
 * "turn on location services" flow on Android.
 *
 * The web layer calls these methods on app start:
 *  - checkPermission()          -> current permission state for the location alias
 *  - requestPermission()        -> shows the native runtime permission dialog
 *  - isLocationEnabled()        -> whether the device's GPS location toggle is on
 *  - openLocationSettings()     -> opens the system location settings screen
 */
@CapacitorPlugin(
    name = "LocationServices",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION
            }
        )
    }
)
public class LocationServicesPlugin extends Plugin {

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("location", getPermissionState("location").toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("location", "granted");
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("location", call, "locationPermissionsCallback");
    }

    @PermissionCallback
    private void locationPermissionsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("location", getPermissionState("location").toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void isLocationEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", isLocationServiceEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private boolean isLocationServiceEnabled() {
        Context context = getContext();
        LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return locationManager.isLocationEnabled();
        }

        try {
            boolean gpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER);
            boolean networkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
            return gpsEnabled || networkEnabled;
        } catch (Exception e) {
            return false;
        }
    }
}
