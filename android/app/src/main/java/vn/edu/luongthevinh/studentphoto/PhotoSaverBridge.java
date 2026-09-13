package vn.edu.luongthevinh.studentphoto;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
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
import java.io.FileInputStream;
import java.io.OutputStream;
import java.util.Locale;

import org.json.JSONObject;

public final class PhotoSaverBridge {
    private static final String PREFS_NAME = "student_photo_cache";
    private static final String SESSION_KEY = "session_json";
    private static final String DRAFT_STUDENT_KEY = "draft_student_key";
    private static final String DRAFT_FILE_NAME = "student_photo_draft.jpg";
    private final Context context;
    private final SharedPreferences preferences;

    public PhotoSaverBridge(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = this.context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public void saveSession(String json) {
        if (json == null || json.length() > 4_000_000) return;
        preferences.edit().putString(SESSION_KEY, json).apply();
    }

    @JavascriptInterface
    public String loadSession() {
        return preferences.getString(SESSION_KEY, "");
    }

    @JavascriptInterface
    public void clearSession() {
        preferences.edit().remove(SESSION_KEY).apply();
    }

    @JavascriptInterface
    public boolean cacheDraft(String dataUrl, String studentKey) {
        try {
            int comma = dataUrl == null ? -1 : dataUrl.indexOf(',');
            if (comma < 0 || studentKey == null || studentKey.isEmpty()) return false;
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            try (FileOutputStream stream = new FileOutputStream(draftFile(), false)) {
                stream.write(bytes);
            }
            preferences.edit().putString(DRAFT_STUDENT_KEY, studentKey).commit();
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    @JavascriptInterface
    public String loadDraft() {
        File file = draftFile();
        String studentKey = preferences.getString(DRAFT_STUDENT_KEY, "");
        if (!file.isFile() || studentKey.isEmpty()) return "";
        try (FileInputStream stream = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int offset = 0;
            while (offset < bytes.length) {
                int count = stream.read(bytes, offset, bytes.length - offset);
                if (count < 0) break;
                offset += count;
            }
            if (offset != bytes.length) return "";
            JSONObject result = new JSONObject();
            result.put("studentKey", studentKey);
            result.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
            return result.toString();
        } catch (Exception error) {
            return "";
        }
    }

    @JavascriptInterface
    public void clearDraft() {
        preferences.edit().remove(DRAFT_STUDENT_KEY).apply();
        File file = draftFile();
        if (file.exists()) file.delete();
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

    private File draftFile() {
        return new File(context.getFilesDir(), DRAFT_FILE_NAME);
    }

    private void showToast(String message) {
        new android.os.Handler(context.getMainLooper()).post(
                () -> Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        );
    }
}
