package com.kiaralaundry.mobile;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Remembers the shop's server and keeps it in the app. Every other link opens in the
 * phone's browser. Also adds the printing and file downloads a WebView lacks.
 */
@CapacitorPlugin(name = "ShopServer")
public class ShopServerPlugin extends Plugin {

    private static final String PREFERENCES = "shop-server";
    private static final String ADDRESS = "address";

    @Override
    public void load() {
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new NativePrinting(), "KiaraNative");
        webView.setDownloadListener((url, userAgent, disposition, mimeType, length) ->
            download(url, userAgent, disposition, mimeType)
        );
    }

    /** Cookies reach storage only now and then, and Android can end the app at any time. */
    @Override
    protected void handleOnPause() {
        CookieManager.getInstance().flush();
    }

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String saved = savedAddress();
        if (saved == null) return null;
        Uri server = Uri.parse(saved);
        boolean sameServer =
            server.getHost().equals(url.getHost()) &&
            server.getScheme().equals(url.getScheme()) &&
            server.getPort() == url.getPort();
        return sameServer ? Boolean.FALSE : null;
    }

    @PluginMethod
    public void saved(PluginCall call) {
        JSObject result = new JSObject();
        result.put(ADDRESS, savedAddress());
        call.resolve(result);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString(ADDRESS);
        if (address == null || !(URLUtil.isHttpUrl(address) || URLUtil.isHttpsUrl(address))) {
            call.reject("Not a server address.");
            return;
        }
        preferences().edit().putString(ADDRESS, address).apply();
        getActivity().runOnUiThread(() -> getBridge().getWebView().loadUrl(address));
        call.resolve();
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private String savedAddress() {
        return preferences().getString(ADDRESS, null);
    }

    /** Runs outside the WebView, so the request carries the session cookie itself. */
    private void download(String url, String userAgent, String disposition, String mimeType) {
        String fileName = URLUtil.guessFileName(url, disposition, mimeType);
        String cookie = CookieManager.getInstance().getCookie(url);
        new Thread(() -> {
            try {
                saveToDownloads(url, cookie, userAgent, fileName, mimeType);
                showMessage("Saved " + fileName + " to Downloads");
            } catch (IOException error) {
                Logger.error("Could not save " + url, error);
                showMessage("Could not save " + fileName);
            }
        })
            .start();
    }

    private void saveToDownloads(String url, String cookie, String userAgent, String fileName, String mimeType)
        throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestProperty("Cookie", cookie);
        connection.setRequestProperty("User-Agent", userAgent);
        if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
            throw new IOException("Server answered " + connection.getResponseCode());
        }

        ContentResolver files = getContext().getContentResolver();
        ContentValues details = new ContentValues();
        details.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
        details.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        details.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri file = files.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, details);
        if (file == null) throw new IOException("Downloads is not available");

        try (InputStream source = connection.getInputStream(); OutputStream target = files.openOutputStream(file)) {
            byte[] buffer = new byte[8192];
            for (int read = source.read(buffer); read != -1; read = source.read(buffer)) {
                target.write(buffer, 0, read);
            }
        } catch (IOException error) {
            files.delete(file, null, null);
            throw error;
        } finally {
            connection.disconnect();
        }

        details.clear();
        details.put(MediaStore.Downloads.IS_PENDING, 0);
        files.update(file, details, null, null);
    }

    private void showMessage(String message) {
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), message, Toast.LENGTH_LONG).show());
    }

    /** A WebView ignores window.print, so the app's Print button calls this instead. */
    private class NativePrinting {

        @JavascriptInterface
        public void print() {
            getActivity()
                .runOnUiThread(() -> {
                    WebView webView = getBridge().getWebView();
                    PrintManager printing = getContext().getSystemService(PrintManager.class);
                    String title = webView.getTitle();
                    printing.print(title, webView.createPrintDocumentAdapter(title), null);
                });
        }
    }
}
