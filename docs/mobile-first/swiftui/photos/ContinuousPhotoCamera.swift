import AVFoundation
import SwiftUI
import UIKit

enum ContinuousPhotoCameraError: LocalizedError {
    case permissionDenied
    case noRearCamera
    case configurationFailed
    case noPhotoData

    var errorDescription: String? {
        switch self {
        case .permissionDenied: return "Allow camera access in Settings to take photos."
        case .noRearCamera: return "No rear camera is available."
        case .configurationFailed: return "The camera could not be configured."
        case .noPhotoData: return "The camera did not return a photo."
        }
    }
}

/// One long-lived AVFoundation session. A shutter press creates fresh
/// `AVCapturePhotoSettings` and never dismisses the preview.
@MainActor
final class ContinuousPhotoCamera: NSObject, ObservableObject {
    @Published private(set) var isRunning = false
    @Published private(set) var isCapturing = false
    @Published private(set) var errorMessage: String?

    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(label: "com.cycleforge.photo-session")
    private var configured = false
    private var processors: [Int64: PhotoCaptureProcessor] = [:]

    func start() async {
        guard await cameraPermission() else {
            errorMessage = ContinuousPhotoCameraError.permissionDenied.localizedDescription
            return
        }
        do {
            try await configureIfNeeded()
            let session = self.session
            sessionQueue.async { session.startRunning() }
            isRunning = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func stop() {
        let session = self.session
        sessionQueue.async {
            if session.isRunning { session.stopRunning() }
        }
        isRunning = false
    }

    func capture(completion: @escaping (Result<Data, Error>) -> Void) {
        guard configured, !isCapturing else { return }
        isCapturing = true

        // Apple requires a unique settings object for every capture call.
        let settings = AVCapturePhotoSettings()
        settings.photoQualityPrioritization = .quality
        if output.supportedFlashModes.contains(.auto) { settings.flashMode = .auto }

        let captureID = settings.uniqueID
        let processor = PhotoCaptureProcessor { [weak self] result in
            Task { @MainActor in
                self?.processors[captureID] = nil
                self?.isCapturing = false
                if case let .failure(error) = result {
                    self?.errorMessage = error.localizedDescription
                }
                completion(result)
            }
        }
        processors[captureID] = processor // retain until the delegate finishes
        let output = self.output
        sessionQueue.async {
            output.capturePhoto(with: settings, delegate: processor)
        }
    }

    private func cameraPermission() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .video)
        default: return false
        }
    }

    private func configureIfNeeded() async throws {
        guard !configured else { return }
        let session = self.session
        let output = self.output
        try await withCheckedThrowingContinuation { continuation in
            sessionQueue.async {
                do {
                    session.beginConfiguration()
                    defer { session.commitConfiguration() }
                    session.sessionPreset = .photo

                    guard let camera = AVCaptureDevice.default(
                        .builtInWideAngleCamera,
                        for: .video,
                        position: .back
                    ) else { throw ContinuousPhotoCameraError.noRearCamera }
                    let input = try AVCaptureDeviceInput(device: camera)
                    guard session.canAddInput(input), session.canAddOutput(output) else {
                        throw ContinuousPhotoCameraError.configurationFailed
                    }
                    session.addInput(input)
                    session.addOutput(output)
                    output.maxPhotoQualityPrioritization = .quality
                    continuation.resume()
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
        configured = true
    }
}

private final class PhotoCaptureProcessor: NSObject, AVCapturePhotoCaptureDelegate {
    private let completion: (Result<Data, Error>) -> Void

    init(completion: @escaping (Result<Data, Error>) -> Void) {
        self.completion = completion
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        if let error {
            completion(.failure(error))
        } else if let data = photo.fileDataRepresentation() {
            completion(.success(data))
        } else {
            completion(.failure(ContinuousPhotoCameraError.noPhotoData))
        }
    }
}

final class CameraPreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> CameraPreviewUIView {
        let view = CameraPreviewUIView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: CameraPreviewUIView, context: Context) {
        uiView.previewLayer.session = session
    }
}
