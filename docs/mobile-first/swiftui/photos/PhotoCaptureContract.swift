import Foundation

/// Must stay byte-for-byte aligned with `PHOTO_ENTITY_TYPES` in
/// `src/lib/photos/types.ts`. Native code does not invent another media API.
enum PhotoEntityType: String, Codable, Sendable {
    case receiving = "RECEIVING"
    case receivingLine = "RECEIVING_LINE"
    case packerLog = "PACKER_LOG"
    case serialUnit = "SERIAL_UNIT"
    case order = "ORDER"
    case sku = "SKU"
    case skuStock = "SKU_STOCK"
    case binAdjustment = "BIN_ADJUSTMENT"
    case sharePack = "SHARE_PACK"
    case zendeskTicket = "ZENDESK_TICKET"
    case repairService = "REPAIR_SERVICE"
    case staff = "STAFF"
    case workAssignment = "WORK_ASSIGNMENT"
}

enum PhotoCaptureSource: String, Codable, Sendable {
    case camera
    case photoLibrary
}

enum PhotoLinkRole: String, Codable, Sendable {
    case primary
    case claimEvidence = "claim_evidence"
    case insuranceShare = "insurance_share"
}

enum PhotoAspect: String, Codable, Sendable {
    case shippingLabel = "shipping_label"
    case boxExterior = "box_exterior"
    case boxInterior = "box_interior"
    case packingMaterial = "packing_material"
    case included
    case serial
    case front
    case back
    case side
    case bottom
}

enum PhotoUploadState: String, Codable, Sendable {
    case queued
    case uploading
    case uploaded
    case failed
}

/// The native equivalent of the arguments passed to `uploadPhotoClient`.
struct PhotoUploadTarget: Codable, Hashable, Sendable {
    let entityType: PhotoEntityType
    let entityId: Int
    var photoType: String?
    var linkRole: PhotoLinkRole?
    var poRef: String?
    var photoAspect: PhotoAspect?
}

struct CapturedPhotoAsset: Identifiable, Codable, Sendable {
    let id: UUID
    let captureSessionID: UUID
    let localFileURL: URL
    let capturedAt: Date
    let source: PhotoCaptureSource
    let target: PhotoUploadTarget
    var uploadState: PhotoUploadState
    var remotePhotoId: Int?
    var remoteURL: URL?
    var errorMessage: String?
}

struct PhotoUploadResponse: Decodable, Sendable {
    let id: Int
    let url: URL
    let thumbUrl: URL
    let claimTicketId: Int?
}

protocol PhotoUploading: Sendable {
    func upload(data: Data, asset: CapturedPhotoAsset) async throws -> PhotoUploadResponse
}
