import PhotosUI
import SwiftUI

/// Native V2 surface: persistent viewfinder, repeated shutter, batch library
/// import, immediate per-photo upload, and one final Done action.
struct MobileMultiPhotoCaptureView: View {
    @EnvironmentObject private var uploads: PhotoUploadCoordinator
    @StateObject private var camera = ContinuousPhotoCamera()
    @State private var librarySelection: [PhotosPickerItem] = []
    @State private var captureSessionID = UUID()
    @State private var pendingSaves = 0

    let target: PhotoUploadTarget
    let maxPhotos: Int
    let onCancel: () -> Void
    let onDone: () -> Void

    private var scopedAssets: [CapturedPhotoAsset] {
        uploads.assets.filter { $0.captureSessionID == captureSessionID }
    }

    private var remaining: Int { max(0, maxPhotos - scopedAssets.count - pendingSaves) }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            CameraPreview(session: camera.session).ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                Spacer()
                if let message = camera.errorMessage {
                    Text(message)
                        .font(.footnote.weight(.semibold))
                        .padding(12)
                        .background(.black.opacity(0.72), in: RoundedRectangle(cornerRadius: 12))
                        .padding()
                }
                filmstrip
                controls
            }
        }
        .foregroundStyle(.white)
        .task {
            uploads.resumePendingUploads()
            await camera.start()
        }
        .onDisappear { camera.stop() }
        .onChange(of: librarySelection) { _, items in
            Task { await importLibraryItems(items) }
        }
    }

    private var topBar: some View {
        HStack {
            Text("\(scopedAssets.count)/\(maxPhotos)")
                .font(.caption.monospaced().weight(.bold))
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(.black.opacity(0.55), in: Capsule())
            Spacer()
            Button(action: close) {
                Image(systemName: "xmark")
                    .frame(width: 44, height: 44)
                    .background(.black.opacity(0.55), in: Circle())
            }
            .accessibilityLabel("Close photo capture")
        }
        .padding(.horizontal, 12)
    }

    private var filmstrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(scopedAssets) { asset in
                    ZStack(alignment: .topTrailing) {
                        LocalPhotoThumbnail(fileURL: asset.localFileURL)
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: 10))

                        uploadMark(asset.uploadState)
                            .offset(x: 5, y: -5)
                    }
                    .contextMenu {
                        if asset.uploadState == .failed {
                            Button("Retry") { uploads.retry(id: asset.id) }
                        }
                        Button("Remove", role: .destructive) { uploads.remove(id: asset.id) }
                    }
                }
            }
            .padding(.horizontal, 12)
        }
        .frame(height: scopedAssets.isEmpty ? 0 : 80)
        .background(.clear)
    }

    private var controls: some View {
        HStack {
            PhotosPicker(
                selection: $librarySelection,
                maxSelectionCount: remaining,
                matching: .images
            ) {
                Image(systemName: "photo.on.rectangle")
                    .font(.title3.weight(.semibold))
                    .frame(width: 56, height: 56)
                    .background(.black.opacity(0.55), in: Circle())
            }
            .disabled(remaining == 0)
            .accessibilityLabel("Choose more photos")

            Spacer()

            Button(action: capture) {
                ZStack {
                    Circle().stroke(.white, lineWidth: 4).frame(width: 78, height: 78)
                    Circle().fill(.white.opacity(0.22)).frame(width: 66, height: 66)
                    if camera.isCapturing { ProgressView().tint(.white) }
                }
            }
            .disabled(camera.isCapturing || !camera.isRunning || remaining == 0)
            .accessibilityLabel("Take photo")

            Spacer()

            Button(action: onDone) {
                Image(systemName: "checkmark")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.green)
                    .frame(width: 56, height: 56)
            }
            .disabled(scopedAssets.isEmpty)
            .accessibilityLabel("Done")
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.clear)
    }

    private func capture() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        camera.capture { result in
            switch result {
            case let .success(data):
                pendingSaves += 1
                Task {
                    defer { pendingSaves -= 1 }
                    try? await uploads.enqueue(
                        imageData: data,
                        source: .camera,
                        target: target,
                        captureSessionID: captureSessionID
                    )
                }
            case .failure:
                break // Camera publishes its actionable error state.
            }
        }
    }

    private func close() {
        if scopedAssets.isEmpty { onCancel() }
        else { onDone() }
    }

    private func importLibraryItems(_ items: [PhotosPickerItem]) async {
        defer { librarySelection = [] }
        for item in items.prefix(remaining) {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            try? await uploads.enqueue(
                imageData: data,
                source: .photoLibrary,
                target: target,
                captureSessionID: captureSessionID
            )
        }
    }

    @ViewBuilder
    private func uploadMark(_ state: PhotoUploadState) -> some View {
        switch state {
        case .queued, .uploading:
            ProgressView().tint(.white).padding(5).background(.black.opacity(0.7), in: Circle())
        case .uploaded:
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.white, .green)
        case .failed:
            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.white, .red)
        }
    }
}

private struct LocalPhotoThumbnail: View {
    let fileURL: URL

    var body: some View {
        if let image = UIImage(contentsOfFile: fileURL.path) {
            Image(uiImage: image).resizable().scaledToFill()
        } else {
            Color.white.opacity(0.12)
        }
    }
}
