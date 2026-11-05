package com.donkey.cardgame;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NearbyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
