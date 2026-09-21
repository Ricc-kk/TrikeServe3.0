package com.trikeserve.app;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the app-local location plugin before Capacitor boots.
        registerPlugin(LocationServicesPlugin.class);
        super.onCreate(savedInstanceState);

        // The app routes with real paths, so the WebView keeps a history entry per
        // screen. With no handler registered, the system back button falls through
        // to Android's default, which finishes the activity and kills the app -
        // even mid-ride. Walk the WebView history instead, and once there is
        // nothing left to go back to, send the app to the background rather than
        // exiting it.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                Bridge bridge = getBridge();
                WebView webView = bridge == null ? null : bridge.getWebView();

                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }

                moveTaskToBack(true);
            }
        });
    }
}
