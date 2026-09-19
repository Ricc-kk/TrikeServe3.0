package com.trikeserve.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the app-local location plugin before Capacitor boots.
        registerPlugin(LocationServicesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
