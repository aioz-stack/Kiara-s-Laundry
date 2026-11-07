package com.kiaralaundry.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShopServerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
