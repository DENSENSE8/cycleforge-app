# V2 multi-photo capture

This folder is the native reference architecture for the web capture root at
`src/components/mobile/photos/MobileNativePhotoCapture.tsx`. Both adapters emit
the same capture facts and use the same upload API. Native adds this durable
lifecycle:

1. Capture repeatedly without dismissing the viewfinder.
2. Normalize each photo to a 720 px long edge JPEG.
3. Write it to durable local storage before networking.
4. Enqueue and upload each photo independently.
5. Keep failed photos visible and retryable.
6. Treat **Done** as navigation only; it never owns upload correctness.

The native chrome mirrors web: count left and close right at the top; gallery,
glyph-free shutter with impact feedback, and green checkmark float at the
bottom without a toolbar background.

Each presentation gets a `captureSessionID`; the maximum-photo count applies to
that session, while the app-scoped coordinator can keep uploads from older
screens running safely in the background.

## Xcode integration

Add the five Swift files to the iOS application target, add an
`NSCameraUsageDescription` to the target, and construct one app-scoped
coordinator. `PhotosPicker` does not require broad photo-library permission;
do not request it unless another feature directly reads the library:

```swift
@main
struct CycleForgeApp: App {
    @StateObject private var uploads = PhotoUploadCoordinator(
        uploader: CycleForgePhotoUploadClient(
            baseURL: URL(string: "https://your-cycleforge-host")!,
            authHeaders: { ["Authorization": "Bearer \(try await token())"] }
        )
    )

    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(uploads)
        }
    }
}
```

Present `MobileMultiPhotoCaptureView` with the entity target already known:

```swift
MobileMultiPhotoCaptureView(
    target: PhotoUploadTarget(
        entityType: .receiving,
        entityId: receivingID,
        photoType: "receiving_unbox_carton",
        linkRole: nil,
        poRef: purchaseOrder,
        photoAspect: nil
    ),
    maxPhotos: 12,
    onCancel: dismiss,
    onDone: dismiss
)
```

The client posts the same multipart names as web to
`POST /api/photos/upload`: `file`, `entityType`, `entityId`, `photoType`,
`linkRole`, `poRef`, `photoAspect`, and `clientCapturedAt`. Do not add a native
photo endpoint or encode UI state into this contract.

## Ownership boundary

- `ContinuousPhotoCamera` owns AVFoundation permissions, session and shutter.
- `MobileMultiPhotoCaptureView` owns only presentation and operator intent.
- `PhotoUploadCoordinator` is app-scoped and owns files, retry and upload state.
- `CycleForgePhotoUploadClient` is the sole native HTTP adapter.
- `PhotoUploadTarget` is created by receiving, stock, SKU, pack or repair flows;
  the capture module never guesses entity linkage.

For a production target, add background `URLSession` transfer support behind
`PhotoUploading`; the view and capture code remain unchanged.
