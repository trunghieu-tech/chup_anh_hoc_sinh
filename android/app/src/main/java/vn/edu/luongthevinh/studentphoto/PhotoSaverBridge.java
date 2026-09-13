package vn.edu.luongthevinh.studentphoto;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

public final class PhotoSaverBridge {
    private final Context context;

    public PhotoSaverBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public boolean saveImage(String dataUrl, String requestedFileName) {
        String fileName = safeFileName(requestedFileName);
        try {
            int comma = dataUrl == null ? -1 : dataUrl.indexOf(',');
            if (comma < 0) throw new IllegalArgumentException("Invalid image data");
            byte[] imageBytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            if (imageBytes.length == 0) throw new IllegalArgumentException("Empty image");

            boolean saved = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? saveWithMediaStore(imageBytes, fileName)
                    : saveLegacy(imageBytes, fileName);
            if (saved) showToast("Đã lưu Pictures/LTV_Hoc_Sinh/" + fileName);
            return saved;
        } catch (Exception error) {
            showToast("Không lưu được ảnh: " + error.getMessage());
            return false;
        }
    }

    private boolean saveWithMediaStore(byte[] bytes, String fileName) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        Uri collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        String relativePath = Environment.DIRECTORY_PICTURES + "/LTV_Hoc_Sinh/";

        try (Cursor cursor = resolver.query(
                collection,
                new String[]{MediaStore.Images.Media._ID},
                MediaStore.Images.Media.DISPLAY_NAME + "=? AND " + MediaStore.Images.Media.RELATIVE_PATH + "=?",
                new String[]{fileName, relativePath},
                null
        )) {
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    Uri oldImage = Uri.withAppendedPath(collection, String.valueOf(cursor.getLong(0)));
                    resolver.delete(oldImage, null, null);
                }
            }
        }

        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, relativePath);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri imageUri = resolver.insert(collection, values);
        if (imageUri == null) throw new IllegalStateException("Không tạo được tệp ảnh");

        try {
            try (OutputStream stream = resolver.openOutputStream(imageUri, "w")) {
                if (stream == null) throw new IllegalStateException("Không mở được tệp ảnh");
                stream.write(bytes);
            }
            ContentValues ready = new ContentValues();
            ready.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(imageUri, ready, null, null);
            return true;
        } catch (Exception error) {
            resolver.delete(imageUri, null, null);
            throw error;
        }
    }

    @SuppressWarnings("deprecation")
    private boolean saveLegacy(byte[] bytes, String fileName) throws Exception {
        if (context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("Chưa có quyền lưu bộ nhớ");
        }
        File pictures = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
        File directory = new File(pictures, "LTV_Hoc_Sinh");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Không tạo được thư mục lưu");
        File output = new File(directory, fileName);
        try (FileOutputStream stream = new FileOutputStream(output, false)) {
            stream.write(bytes);
        }
        MediaScannerConnection.scanFile(context, new String[]{output.getAbsolutePath()}, new String[]{"image/jpeg"}, null);
        return true;
    }

    private String safeFileName(String requested) {
        String name = requested == null ? "hoc-sinh.jpg" : requested.trim();
        name = name.replaceAll("[\\\\/:*?\"<>|]", "-");
        if (name.isEmpty()) name = "hoc-sinh.jpg";
        if (!name.toLowerCase(Locale.ROOT).endsWith(".jpg")) name += ".jpg";
        return name;
    }

    private void showToast(String message) {
        new android.os.Handler(context.getMainLooper()).post(
                () -> Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        );
    }
}
