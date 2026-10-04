import Foundation
import UIKit

/// App-scoped owner of local files, retry state and uploads. Inject one instance
/// through the SwiftUI environment; a capture screen may disappear while this
/// object continues uploading.
@MainActor
final class PhotoUploadCoordinator: ObservableObject {
    @Published private(set) var assets: [CapturedPhotoAsset] = []

    private let uploader: any PhotoUploading
    private let fileManager: FileManager
    private let directory: URL
    private let ledgerURL: URL
    private var uploadTasks: [UUID: Task<Void, Never>] = [:]

    init(uploader: any PhotoUploading, fileManager: FileManager = .default) {
        self.uploader = uploader
        self.fileManager = fileManager
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        directory = support.appending(path: "CycleForgePhotoQueue", directoryHint: .isDirectory)
        ledgerURL = directory.appending(path: "ledger.json")
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        restoreLedger()
    }

    var inFlightCount: Int {
        assets.filter { $0.uploadState == .queued || $0.uploadState == .uploading }.count
    }

    @discardableResult
    func enqueue(
        imageData: Data,
        source: PhotoCaptureSource,
        target: PhotoUploadTarget,
        captureSessionID: UUID,
        capturedAt: Date = .now
    ) async throws -> UUID {
        let id = UUID()
        let fileURL = directory.appending(path: "\(id.uuidString).jpg")
        try await Task.detached(priority: .userInitiated) {
            let normalized = try PhotoImageNormalizer.jpeg720(imageData)
            try normalized.write(to: fileURL, options: .atomic)
        }.value
        let asset = CapturedPhotoAsset(
            id: id,
            captureSessionID: captureSessionID,
            localFileURL: fileURL,
            capturedAt: capturedAt,
            source: source,
            target: target,
            uploadState: .queued,
            remotePhotoId: nil,
            remoteURL: nil,
            errorMessage: nil
        )
        assets.append(asset)
        persistLedger()
        startUpload(id: id)
        return id
    }

    func retry(id: UUID) {
        update(id: id) {
            $0.uploadState = .queued
            $0.errorMessage = nil
        }
        startUpload(id: id)
    }

    func remove(id: UUID) {
        uploadTasks[id]?.cancel()
        uploadTasks[id] = nil
        guard let index = assets.firstIndex(where: { $0.id == id }) else { return }
        try? fileManager.removeItem(at: assets[index].localFileURL)
        assets.remove(at: index)
        persistLedger()
    }

    func resumePendingUploads() {
        for asset in assets where asset.uploadState != .uploaded {
            startUpload(id: asset.id)
        }
    }

    private func startUpload(id: UUID) {
        guard uploadTasks[id] == nil,
              let asset = assets.first(where: { $0.id == id }),
              asset.uploadState != .uploaded else { return }

        uploadTasks[id] = Task { [weak self] in
            guard let self else { return }
            self.update(id: id) {
                $0.uploadState = .uploading
                $0.errorMessage = nil
            }
            do {
                guard let current = self.assets.first(where: { $0.id == id }) else { return }
                let localFileURL = current.localFileURL
                let data = try await Task.detached(priority: .utility) {
                    try Data(contentsOf: localFileURL)
                }.value
                let response = try await self.uploader.upload(data: data, asset: current)
                guard !Task.isCancelled else { return }
                self.update(id: id) {
                    $0.uploadState = .uploaded
                    $0.remotePhotoId = response.id
                    $0.remoteURL = response.url
                }
            } catch is CancellationError {
                // Cancellation is deliberate when the operator deletes a shot.
            } catch {
                self.update(id: id) {
                    $0.uploadState = .failed
                    $0.errorMessage = error.localizedDescription
                }
            }
            self.uploadTasks[id] = nil
        }
    }

    private func update(id: UUID, mutation: (inout CapturedPhotoAsset) -> Void) {
        guard let index = assets.firstIndex(where: { $0.id == id }) else { return }
        mutation(&assets[index])
        persistLedger()
    }

    private func restoreLedger() {
        guard let data = try? Data(contentsOf: ledgerURL),
              let restored = try? JSONDecoder().decode([CapturedPhotoAsset].self, from: data) else { return }
        assets = restored.map { asset in
            var copy = asset
            if copy.uploadState == .uploading { copy.uploadState = .queued }
            return copy
        }.filter { fileManager.fileExists(atPath: $0.localFileURL.path) }
    }

    private func persistLedger() {
        guard let data = try? JSONEncoder().encode(assets) else { return }
        try? data.write(to: ledgerURL, options: .atomic)
    }
}

private enum PhotoImageNormalizer {
    static func jpeg720(_ data: Data) throws -> Data {
        guard let image = UIImage(data: data) else { throw ContinuousPhotoCameraError.noPhotoData }
        let size = image.size
        let longEdge = max(size.width, size.height)
        let scale = min(1, 720 / max(1, longEdge))
        let outputSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: outputSize)
        let rendered = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: outputSize))
        }
        guard let jpeg = rendered.jpegData(compressionQuality: 0.85) else {
            throw ContinuousPhotoCameraError.noPhotoData
        }
        return jpeg
    }
}
