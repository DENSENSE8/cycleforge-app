import Foundation

enum PhotoUploadClientError: LocalizedError {
    case invalidResponse
    case rejected(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The server returned an invalid photo response."
        case let .rejected(_, message):
            return message
        }
    }
}

/// Native adapter for the existing web contract. Authentication is injected so
/// the app can use its cookie session today and bearer tokens later without
/// changing capture UI or the upload ledger.
actor CycleForgePhotoUploadClient: PhotoUploading {
    typealias AuthHeaders = @Sendable () async throws -> [String: String]

    private let baseURL: URL
    private let session: URLSession
    private let authHeaders: AuthHeaders

    init(
        baseURL: URL,
        session: URLSession = .shared,
        authHeaders: @escaping AuthHeaders = { [:] }
    ) {
        self.baseURL = baseURL
        self.session = session
        self.authHeaders = authHeaders
    }

    func upload(data: Data, asset: CapturedPhotoAsset) async throws -> PhotoUploadResponse {
        let boundary = "CycleForge-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appendingPathComponent("api/photos/upload"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        for (name, value) in try await authHeaders() {
            request.setValue(value, forHTTPHeaderField: name)
        }

        var body = MultipartFormData(boundary: boundary)
        body.appendFile(
            name: "file",
            filename: "cycleforge-\(asset.id.uuidString).jpg",
            contentType: "image/jpeg",
            data: data
        )
        body.append(name: "entityType", value: asset.target.entityType.rawValue)
        body.append(name: "entityId", value: String(asset.target.entityId))
        body.appendIfPresent(name: "photoType", value: asset.target.photoType)
        body.appendIfPresent(name: "linkRole", value: asset.target.linkRole?.rawValue)
        body.appendIfPresent(name: "poRef", value: asset.target.poRef)
        body.appendIfPresent(name: "photoAspect", value: asset.target.photoAspect?.rawValue)
        // Exact server field: `CLIENT_CAPTURED_AT_FIELD` in capture-provenance.ts.
        body.append(
            name: "clientCapturedAt",
            value: String(Int64(asset.capturedAt.timeIntervalSince1970 * 1_000))
        )
        request.httpBody = body.finalize()

        let (responseData, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw PhotoUploadClientError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let payload = try? JSONDecoder().decode(ServerError.self, from: responseData)
            throw PhotoUploadClientError.rejected(
                status: http.statusCode,
                message: payload?.details ?? payload?.error ?? "Upload failed (\(http.statusCode))"
            )
        }
        return try JSONDecoder().decode(PhotoUploadResponse.self, from: responseData)
    }
}

private struct ServerError: Decodable {
    let error: String?
    let details: String?
}

private struct MultipartFormData {
    let boundary: String
    private var data = Data()

    init(boundary: String) {
        self.boundary = boundary
    }

    mutating func append(name: String, value: String) {
        appendLine("--\(boundary)")
        appendLine("Content-Disposition: form-data; name=\"\(name)\"")
        appendLine("")
        appendLine(value)
    }

    mutating func appendIfPresent(name: String, value: String?) {
        guard let value, !value.isEmpty else { return }
        append(name: name, value: value)
    }

    mutating func appendFile(
        name: String,
        filename: String,
        contentType: String,
        data fileData: Data
    ) {
        appendLine("--\(boundary)")
        appendLine("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"")
        appendLine("Content-Type: \(contentType)")
        appendLine("")
        data.append(fileData)
        data.append(contentsOf: [13, 10])
    }

    mutating func finalize() -> Data {
        appendLine("--\(boundary)--")
        return data
    }

    private mutating func appendLine(_ value: String) {
        data.append(Data("\(value)\r\n".utf8))
    }
}
