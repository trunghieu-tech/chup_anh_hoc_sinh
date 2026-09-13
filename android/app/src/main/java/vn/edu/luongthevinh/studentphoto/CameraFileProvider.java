package vn.edu.luongthevinh.studentphoto;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

public final class CameraFileProvider extends ContentProvider {
    private File cameraDirectory;

    @Override
    public boolean onCreate() {
        cameraDirectory = new File(requireContext().getCacheDir(), "camera");
        return cameraDirectory.exists() || cameraDirectory.mkdirs();
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(resolveFile(uri), ParcelFileDescriptor.parseMode(mode));
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file;
        try {
            file = resolveFile(uri);
        } catch (FileNotFoundException error) {
            return null;
        }
        String[] columns = projection == null
                ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}
                : projection;
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        MatrixCursor.RowBuilder row = cursor.newRow();
        for (String column : columns) {
            if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add(file.getName());
            else if (OpenableColumns.SIZE.equals(column)) row.add(file.length());
            else row.add(null);
        }
        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        return "image/jpeg";
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        try {
            return resolveFile(uri).delete() ? 1 : 0;
        } catch (FileNotFoundException error) {
            return 0;
        }
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("Insert is not supported");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }

    public static Uri uriForFile(android.content.Context context, File file) {
        return new Uri.Builder()
                .scheme("content")
                .authority(context.getPackageName() + ".files")
                .appendPath("camera")
                .appendPath(file.getName())
                .build();
    }

    private File resolveFile(Uri uri) throws FileNotFoundException {
        String fileName = uri.getLastPathSegment();
        if (fileName == null || fileName.contains("/") || fileName.contains("\\")) {
            throw new FileNotFoundException("Invalid camera file");
        }
        File file = new File(cameraDirectory, fileName);
        try {
            String basePath = cameraDirectory.getCanonicalPath() + File.separator;
            if (!file.getCanonicalPath().startsWith(basePath)) throw new FileNotFoundException("Invalid path");
        } catch (IOException error) {
            throw new FileNotFoundException(error.getMessage());
        }
        return file;
    }

    private android.content.Context requireContext() {
        android.content.Context context = getContext();
        if (context == null) throw new IllegalStateException("Provider is not attached");
        return context;
    }
}
