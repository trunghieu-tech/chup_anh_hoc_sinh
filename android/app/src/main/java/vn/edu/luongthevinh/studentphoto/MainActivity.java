package vn.edu.luongthevinh.studentphoto;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.provider.MediaStore;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;

public final class MainActivity extends Activity {
    private static final int REQUEST_FILE = 1001;
    private static final int REQUEST_CAMERA_PERMISSION = 1002;
    private static final int REQUEST_STORAGE_PERMISSION = 1003;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private WebChromeClient.FileChooserParams pendingFileParams;
    private PermissionRequest pendingWebPermission;
    private Uri capturedPhotoUri;
    private File capturedPhotoFile;
    private boolean cameraCaptureActive;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.rgb(243, 246, 244));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);
        configureWebView();
        requestLegacyStoragePermissionIfNeeded();
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        webView.addJavascriptInterface(new PhotoSaverBridge(this), "AndroidPhotoSaver");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermission(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermission == request) pendingWebPermission = null;
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params
            ) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                boolean wantsImage = Arrays.stream(params.getAcceptTypes())
                        .anyMatch(type -> type != null && type.toLowerCase().contains("image"));
                if (wantsImage && params.isCaptureEnabled()) ensureCameraThenCapture(params);
                else launchDocumentChooser(params);
                return true;
            }
        });
    }

    private void handleWebPermission(PermissionRequest request) {
        boolean wantsCamera = Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
        if (!wantsCamera) {
            request.deny();
            return;
        }
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
            pendingWebPermission = request;
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA_PERMISSION);
        }
    }

    private void ensureCameraThenCapture(WebChromeClient.FileChooserParams params) {
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchCameraCapture();
        } else {
            pendingFileParams = params;
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA_PERMISSION);
        }
    }

    private void launchCameraCapture() {
        try {
            File directory = new File(getCacheDir(), "camera");
            if (!directory.exists() && !directory.mkdirs()) throw new IOException("Không tạo được bộ nhớ camera");
            capturedPhotoFile = File.createTempFile("student_", ".jpg", directory);
            capturedPhotoUri = CameraFileProvider.uriForFile(this, capturedPhotoFile);

            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, capturedPhotoUri);
            intent.setClipData(ClipData.newRawUri("student-photo", capturedPhotoUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            List<ResolveInfo> handlers = getPackageManager().queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
            for (ResolveInfo handler : handlers) {
                grantUriPermission(handler.activityInfo.packageName, capturedPhotoUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            }
            cameraCaptureActive = true;
            startActivityForResult(intent, REQUEST_FILE);
        } catch (Exception error) {
            finishFileRequest(null);
            Toast.makeText(this, "Không mở được camera: " + error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void launchDocumentChooser(WebChromeClient.FileChooserParams params) {
        try {
            cameraCaptureActive = false;
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("*/*");
            picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
            picker.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                    "text/csv",
                    "text/comma-separated-values",
                    "application/csv",
                    "application/vnd.ms-excel",
                    "text/plain",
                    "application/octet-stream"
            });
            startActivityForResult(picker, REQUEST_FILE);
        } catch (Exception error) {
            finishFileRequest(null);
            Toast.makeText(this, "Không mở được trình chọn tệp: " + error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_FILE) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (cameraCaptureActive && capturedPhotoUri != null && capturedPhotoFile != null && capturedPhotoFile.length() > 0) {
                result = new Uri[]{capturedPhotoUri};
            } else {
                result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
        }
        finishFileRequest(result);
        scheduleCameraCleanup();
    }

    private void finishFileRequest(Uri[] result) {
        if (fileCallback != null) fileCallback.onReceiveValue(result);
        fileCallback = null;
        pendingFileParams = null;
        cameraCaptureActive = false;
    }

    private void scheduleCameraCleanup() {
        File oldFile = capturedPhotoFile;
        Uri oldUri = capturedPhotoUri;
        capturedPhotoFile = null;
        capturedPhotoUri = null;
        if (oldFile == null) return;
        new Handler(getMainLooper()).postDelayed(() -> {
            if (oldUri != null) revokeUriPermission(oldUri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            oldFile.delete();
        }, 120_000L);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQUEST_CAMERA_PERMISSION) {
            if (pendingWebPermission != null) {
                if (granted) pendingWebPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                else pendingWebPermission.deny();
                pendingWebPermission = null;
            }
            if (pendingFileParams != null) {
                WebChromeClient.FileChooserParams params = pendingFileParams;
                pendingFileParams = null;
                if (granted) launchCameraCapture();
                else {
                    finishFileRequest(null);
                    Toast.makeText(this, R.string.camera_permission_denied, Toast.LENGTH_LONG).show();
                }
            }
        } else if (requestCode == REQUEST_STORAGE_PERMISSION && !granted) {
            Toast.makeText(this, R.string.storage_permission_denied, Toast.LENGTH_LONG).show();
        }
    }

    private void requestLegacyStoragePermissionIfNeeded() {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQUEST_STORAGE_PERMISSION);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (pendingWebPermission != null) pendingWebPermission.deny();
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }
}
